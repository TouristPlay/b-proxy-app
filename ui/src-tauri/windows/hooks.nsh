; Помощник B-Proxy — служба Windows: включает VPN без окна UAC при каждом подключении.
; Установщик работает с правами администратора, поэтому ставит службу он.

!macro NSIS_HOOK_PREINSTALL
  ; Обновление: служба держит файл ядра — останавливаем её перед заменой файлов.
  nsExec::ExecToLog 'sc.exe stop BProxyHelper'
  Sleep 1500
!macroend

!macro NSIS_HOOK_POSTINSTALL
  nsExec::ExecToLog '"$INSTDIR\bproxy-core.exe" --install-helper'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::ExecToLog '"$INSTDIR\bproxy-core.exe" --uninstall-helper'
!macroend
