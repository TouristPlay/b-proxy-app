import 'dart:ffi';
import 'dart:io';
import 'dart:isolate';

import 'package:ffi/ffi.dart';

import 'xray_bridge.dart';

typedef _InvokeNative = Pointer<Utf8> Function(Pointer<Utf8>);
typedef _FreeNative = Void Function(Pointer<Utf8>);
typedef _FreeDart = void Function(Pointer<Utf8>);

/// libXray для Windows и Linux через FFI.
///
/// Библиотека лежит рядом с исполняемым файлом (Windows: libXray.dll)
/// или в папке lib/ сборки Flutter (Linux: libXray.so).
/// Вызовы идут в отдельном изоляте, чтобы долгие операции
/// (пинг, запуск ядра) не подвешивали интерфейс.
class FfiXrayBridge extends XrayBridge {
  static String libraryPath() {
    final exeDir = File(Platform.resolvedExecutable).parent.path;
    final sep = Platform.pathSeparator;
    if (Platform.isWindows) return '$exeDir${sep}libXray.dll';
    return '$exeDir${sep}lib${sep}libXray.so';
  }

  @override
  Future<String> invokeRaw(String requestJson) {
    final path = libraryPath();
    return Isolate.run(() => _invokeSync(path, requestJson));
  }

  static String _invokeSync(String path, String requestJson) {
    final lib = DynamicLibrary.open(path);
    final invoke =
        lib.lookupFunction<_InvokeNative, _InvokeNative>('CGoInvoke');
    final free = lib.lookupFunction<_FreeNative, _FreeDart>('CGoFree');
    final request = requestJson.toNativeUtf8();
    try {
      final response = invoke(request);
      if (response == nullptr) {
        throw XrayException('libXray вернул пустой ответ');
      }
      try {
        return response.toDartString();
      } finally {
        free(response);
      }
    } finally {
      malloc.free(request);
    }
  }
}
