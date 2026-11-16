import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/app_controller.dart';
import '../theme.dart';
import '../widgets/common.dart';

class AddSubscriptionScreen extends StatefulWidget {
  const AddSubscriptionScreen({super.key, required this.app, this.initialUrl});
  final AppController app;
  final String? initialUrl;

  @override
  State<AddSubscriptionScreen> createState() => _AddSubscriptionScreenState();
}

class _AddSubscriptionScreenState extends State<AddSubscriptionScreen> {
  late final _controller = TextEditingController(text: widget.initialUrl);
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _paste() async {
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    final text = data?.text?.trim();
    if (text != null && text.isNotEmpty) {
      setState(() {
        _controller.text = text;
        _error = null;
      });
    }
  }

  Future<void> _submit() async {
    final url = _controller.text.trim();
    if (url.isEmpty) {
      setState(() => _error = 'Вставьте ссылку на подписку');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.app.addSubscription(url);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      final text = e.toString();
      setState(() => _error = text.startsWith('Exception: ') ? text.substring(11) : text);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Scaffold(
      appBar: AppBar(title: const Text('Новая подписка')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const Eyebrow('Шаг 1'),
              const SizedBox(height: 8),
              Text('Скопируйте ссылку', style: display(20, c.fg)),
              const SizedBox(height: 8),
              Text(
                'Ссылка есть в личном кабинете BaobabVPN и в Telegram-боте. '
                'Она начинается с https://',
                style: TextStyle(color: c.muted, height: 1.5),
              ),
              const SizedBox(height: 24),
              const Eyebrow('Шаг 2'),
              const SizedBox(height: 8),
              Text('Вставьте её сюда', style: display(20, c.fg)),
              const SizedBox(height: 12),
              TextField(
                controller: _controller,
                keyboardType: TextInputType.url,
                autocorrect: false,
                minLines: 1,
                maxLines: 3,
                onSubmitted: (_) => _submit(),
                decoration: InputDecoration(
                  hintText: 'https://sub.baobabproxy.com/…',
                  errorText: _error,
                  errorMaxLines: 3,
                  suffixIcon: IconButton(
                    tooltip: 'Вставить из буфера',
                    icon: Icon(Icons.content_paste_rounded, color: c.muted),
                    onPressed: _paste,
                  ),
                ),
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _loading ? null : _submit,
                child: _loading
                    ? SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: c.onAccent))
                    : const Text('Добавить'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
