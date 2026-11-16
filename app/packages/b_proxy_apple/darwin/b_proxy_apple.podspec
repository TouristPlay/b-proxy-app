Pod::Spec.new do |s|
  s.name             = 'b_proxy_apple'
  s.version          = '0.1.0'
  s.summary          = 'B-Proxy: libXray и управление VPN на iOS и macOS.'
  s.homepage         = 'https://baobabproxy.com'
  s.license          = { :type => 'Proprietary' }
  s.author           = { 'BaobabVPN' => 'support@baobabproxy.com' }
  s.source           = { :path => '.' }
  s.source_files     = 'Classes/**/*.swift'
  s.swift_version    = '5.0'

  s.ios.deployment_target = '15.0'
  s.osx.deployment_target = '12.0'
  s.ios.dependency 'Flutter'
  s.osx.dependency 'FlutterMacOS'

  # Ядро Xray (статическая библиотека, собирается scripts/build_libxray.sh apple).
  s.vendored_frameworks = 'LibXray.xcframework'
  s.frameworks = 'NetworkExtension'
  s.libraries = 'resolv'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
