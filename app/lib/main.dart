import 'package:flutter/material.dart';

import 'core/app_controller.dart';
import 'screens/home_screen.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final app = AppController();
  await app.init();
  runApp(BProxyApp(app: app));
}

class BProxyApp extends StatelessWidget {
  const BProxyApp({super.key, required this.app});
  final AppController app;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) => MaterialApp(
        title: 'B-Proxy',
        debugShowCheckedModeBanner: false,
        themeMode: app.themeMode,
        theme: buildTheme(Brightness.light),
        darkTheme: buildTheme(Brightness.dark),
        home: HomeScreen(app: app),
      ),
    );
  }
}
