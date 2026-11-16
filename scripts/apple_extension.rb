#!/usr/bin/env ruby
# frozen_string_literal: true

# Добавляет в Xcode-проект Flutter расширение PacketTunnel (Network Extension),
# в котором работает ядро Xray, и выдаёт приложению нужные права.
#
#   ruby scripts/apple_extension.rb ios
#   ruby scripts/apple_extension.rb macos
#
# Запускать после scripts/prepare.sh и scripts/build_libxray.sh apple.
# Скрипт можно запускать повторно: уже добавленное он не дублирует.
# Нужен gem xcodeproj (ставится вместе с CocoaPods).

require 'fileutils'
require 'xcodeproj'

platform = ARGV[0]
abort 'Укажите платформу: ios или macos' unless %w[ios macos].include?(platform)

ios = platform == 'ios'
min_version = ios ? '15.0' : '12.0'
deploy_key = ios ? 'IPHONEOS_DEPLOYMENT_TARGET' : 'MACOSX_DEPLOYMENT_TARGET'

root = File.expand_path('..', __dir__)
app = File.join(root, 'app')
platform_dir = File.join(app, platform)
project_path = File.join(platform_dir, 'Runner.xcodeproj')
abort "Нет #{project_path}. Сначала запустите scripts/prepare.sh" unless File.exist?(project_path)

xcframework = File.join(app, 'packages/b_proxy_apple/darwin/LibXray.xcframework')
abort 'Нет LibXray.xcframework. Сначала запустите scripts/build_libxray.sh apple' unless File.exist?(xcframework)

version, build_number = File.read(File.join(app, 'pubspec.yaml'))[/^version:\s*(\S+)/, 1].split('+')

project = Xcodeproj::Project.open(project_path)
runner = project.targets.find { |t| t.name == 'Runner' } or abort 'В проекте нет цели Runner'
bundle_id = runner.build_configurations.first.build_settings['PRODUCT_BUNDLE_IDENTIFIER']
app_group = "group.#{bundle_id}"

# --- Файлы расширения ---
ext_dir = File.join(platform_dir, 'PacketTunnel')
FileUtils.mkdir_p(ext_dir)
src_dir = File.join(app, 'apple/PacketTunnel')
FileUtils.cp(File.join(src_dir, 'PacketTunnelProvider.swift'), ext_dir)
FileUtils.cp(File.join(src_dir, 'Info.plist'), ext_dir)
ext_entitlements = File.read(File.join(src_dir, "PacketTunnel-#{ios ? 'iOS' : 'macOS'}.entitlements"))
File.write(File.join(ext_dir, 'PacketTunnel.entitlements'),
           ext_entitlements.gsub('group.com.baobabproxy.bProxy', app_group))

# --- Минимальные версии систем (libXray собран под iOS 15 и macOS 12) ---
project.build_configurations.each { |c| c.build_settings[deploy_key] = min_version }
runner.build_configurations.each { |c| c.build_settings[deploy_key] = min_version }

podfile = File.join(platform_dir, 'Podfile')
if File.exist?(podfile)
  text = File.read(podfile)
  text = if ios
           text.sub(/^#?\s*platform :ios, '[\d.]+'/, "platform :ios, '#{min_version}'")
         else
           text.sub(/^#?\s*platform :osx, '[\d.]+'/, "platform :osx, '#{min_version}'")
         end
  File.write(podfile, text)
end

# --- Права приложения: Network Extension и общая группа с расширением ---
def set_entitlements(path, values)
  plist = File.exist?(path) ? Xcodeproj::Plist.read_from_path(path) : {}
  plist.merge!(values)
  Xcodeproj::Plist.write_to_path(plist, path)
end

app_rights = {
  'com.apple.developer.networking.networkextension' => ['packet-tunnel-provider'],
  'com.apple.security.application-groups' => [app_group]
}

if ios
  ent_path = File.join(platform_dir, 'Runner/Runner.entitlements')
  set_entitlements(ent_path, app_rights)
  runner_group = project.main_group.find_subpath('Runner', false)
  if runner_group && runner_group.files.none? { |f| f.path == 'Runner.entitlements' }
    runner_group.new_reference('Runner.entitlements')
  end
  runner.build_configurations.each do |c|
    c.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'Runner/Runner.entitlements'
  end
else
  %w[DebugProfile Release].each do |name|
    set_entitlements(File.join(platform_dir, "Runner/#{name}.entitlements"),
                     app_rights.merge('com.apple.security.network.client' => true))
  end
end

# --- Цель PacketTunnel ---
unless project.targets.any? { |t| t.name == 'PacketTunnel' }
  ext = project.new_target(:app_extension, 'PacketTunnel', ios ? :ios : :osx, min_version, nil, :swift)
  # У Flutter три конфигурации, у новой цели по умолчанию только Debug и Release.
  ext.add_build_configuration('Profile', :release) unless ext.build_configurations.any? { |c| c.name == 'Profile' }

  group = project.main_group.new_group('PacketTunnel', 'PacketTunnel')
  source = group.new_reference('PacketTunnelProvider.swift')
  group.new_reference('Info.plist')
  group.new_reference('PacketTunnel.entitlements')
  ext.add_file_references([source])

  libxray = project.frameworks_group.new_reference('../packages/b_proxy_apple/darwin/LibXray.xcframework')
  ext.frameworks_build_phase.add_file_reference(libxray)
  ext.add_system_framework('NetworkExtension')

  ext.build_configurations.each do |c|
    s = c.build_settings
    s['PRODUCT_BUNDLE_IDENTIFIER'] = "#{bundle_id}.PacketTunnel"
    s['PRODUCT_NAME'] = '$(TARGET_NAME)'
    s['INFOPLIST_FILE'] = 'PacketTunnel/Info.plist'
    s['GENERATE_INFOPLIST_FILE'] = 'NO'
    s['CODE_SIGN_ENTITLEMENTS'] = 'PacketTunnel/PacketTunnel.entitlements'
    s['CODE_SIGN_STYLE'] = 'Automatic'
    s['SWIFT_VERSION'] = '5.0'
    s['MARKETING_VERSION'] = version
    s['CURRENT_PROJECT_VERSION'] = build_number || '1'
    s['OTHER_LDFLAGS'] = ['$(inherited)', '-lresolv']
    s['SKIP_INSTALL'] = 'YES'
    s['ENABLE_BITCODE'] = 'NO'
    s[deploy_key] = min_version
    if ios
      s['TARGETED_DEVICE_FAMILY'] = '1,2'
      s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
    else
      s['ENABLE_HARDENED_RUNTIME'] = 'YES'
      s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/../Frameworks', '@executable_path/../../../../Frameworks']
    end
  end

  runner.add_dependency(ext)
  embed = runner.new_copy_files_build_phase('Embed Foundation Extensions')
  embed.symbol_dst_subfolder_spec = :plug_ins
  file = embed.add_file_reference(ext.product_reference, true)
  file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

  # Встраивание расширения должно идти раньше скрипта Flutter «Thin Binary»,
  # иначе Xcode находит цикл зависимостей.
  runner.build_phases.delete(embed)
  index = runner.build_phases.index(runner.frameworks_build_phase) || 0
  runner.build_phases.insert(index + 1, embed)
end

project.save
puts "PacketTunnel добавлен в #{platform} (#{bundle_id}.PacketTunnel, группа #{app_group})"
