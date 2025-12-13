; RobBob Launcher Bootstrapper
; Маленький установщик (~2MB) который скачивает полный лаунчер
; Компилируется с помощью NSIS: https://nsis.sourceforge.io/

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; ============================================
; НАСТРОЙКИ
; ============================================
!define PRODUCT_NAME "RobBob Launcher"
!define PRODUCT_VERSION "1.0.0"
!define PRODUCT_PUBLISHER "RobBob Team"

; GitHub репозиторий с релизами
!define GITHUB_OWNER "yamineki"
!define GITHUB_REPO "roboby-releases"
!define DOWNLOAD_URL "https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/RobBob-Full.zip"

; Папка установки
!define INSTALL_DIR "$LOCALAPPDATA\RobBob"

; ============================================
; ОСНОВНЫЕ НАСТРОЙКИ УСТАНОВЩИКА
; ============================================
Name "${PRODUCT_NAME}"
OutFile "RobBob-Setup.exe"
InstallDir "${INSTALL_DIR}"
RequestExecutionLevel admin
Unicode True

; Сжатие LZMA для минимального размера
SetCompressor /SOLID lzma
SetCompressorDictSize 32

; ============================================
; ИНТЕРФЕЙС
; ============================================
!define MUI_ICON "..\assets\icon.ico"
!define MUI_UNICON "..\assets\icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEFINISHPAGE_BITMAP_NOSTRETCH

; Страницы установки
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\RobBob.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Запустить RobBob Launcher"
!insertmacro MUI_PAGE_FINISH

; Язык
!insertmacro MUI_LANGUAGE "Russian"

; ============================================
; ПЕРЕМЕННЫЕ
; ============================================
Var DownloadProgress
Var StatusText

; ============================================
; СЕКЦИЯ УСТАНОВКИ
; ============================================
Section "Install" SecInstall
    SetOutPath "$INSTDIR"

    ; Проверяем, есть ли уже установленный лаунчер
    IfFileExists "$INSTDIR\RobBob.exe" AlreadyInstalled DoDownload

AlreadyInstalled:
    ; Лаунчер уже установлен - просто запускаем
    MessageBox MB_YESNO "RobBob Launcher уже установлен.$\n$\nПереустановить?" IDYES DoDownload
    Goto RunLauncher

DoDownload:
    ; Показываем статус
    DetailPrint "Подключение к серверу..."

    ; Скачиваем архив с GitHub
    DetailPrint "Загрузка RobBob Launcher..."

    ; Используем inetc плагин для загрузки с прогрессом
    ; Если нет inetc - используем NSISdl
    NSISdl::download /TIMEOUT=60000 "${DOWNLOAD_URL}" "$TEMP\RobBob-Full.zip"
    Pop $0

    ${If} $0 != "success"
        ; Пробуем альтернативный метод через PowerShell
        DetailPrint "Альтернативная загрузка..."
        nsExec::ExecToLog 'powershell -Command "Invoke-WebRequest -Uri \"${DOWNLOAD_URL}\" -OutFile \"$TEMP\RobBob-Full.zip\" -UseBasicParsing"'
        Pop $0

        IfFileExists "$TEMP\RobBob-Full.zip" +3
            MessageBox MB_OK|MB_ICONERROR "Ошибка загрузки. Проверьте интернет-соединение."
            Abort
    ${EndIf}

    ; Распаковываем архив
    DetailPrint "Распаковка файлов..."

    ; Создаём папку установки
    CreateDirectory "$INSTDIR"

    ; Распаковка через PowerShell
    nsExec::ExecToLog 'powershell -Command "Expand-Archive -Path \"$TEMP\RobBob-Full.zip\" -DestinationPath \"$INSTDIR\" -Force"'
    Pop $0

    ; Удаляем временный архив
    Delete "$TEMP\RobBob-Full.zip"

    ; Проверяем успешность распаковки
    IfFileExists "$INSTDIR\RobBob.exe" +3
        MessageBox MB_OK|MB_ICONERROR "Ошибка распаковки файлов."
        Abort

    ; Создаём ярлык на рабочем столе
    CreateShortCut "$DESKTOP\RobBob.lnk" "$INSTDIR\RobBob.exe"

    ; Создаём ярлык в меню Пуск
    CreateDirectory "$SMPROGRAMS\RobBob"
    CreateShortCut "$SMPROGRAMS\RobBob\RobBob.lnk" "$INSTDIR\RobBob.exe"
    CreateShortCut "$SMPROGRAMS\RobBob\Удалить.lnk" "$INSTDIR\Uninstall.exe"

    ; Записываем информацию для удаления
    WriteUninstaller "$INSTDIR\Uninstall.exe"

    ; Регистрируем в системе
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RobBob" "DisplayName" "${PRODUCT_NAME}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RobBob" "UninstallString" "$INSTDIR\Uninstall.exe"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RobBob" "InstallLocation" "$INSTDIR"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RobBob" "DisplayIcon" "$INSTDIR\RobBob.exe"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RobBob" "Publisher" "${PRODUCT_PUBLISHER}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RobBob" "DisplayVersion" "${PRODUCT_VERSION}"
    WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RobBob" "NoModify" 1
    WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RobBob" "NoRepair" 1

    DetailPrint "Установка завершена!"

RunLauncher:
    ; Ничего не делаем - финишная страница предложит запуск
SectionEnd

; ============================================
; СЕКЦИЯ УДАЛЕНИЯ
; ============================================
Section "Uninstall"
    ; Закрываем лаунчер если запущен
    nsExec::ExecToLog 'taskkill /F /IM RobBob.exe'
    nsExec::ExecToLog 'taskkill /F /IM winws.exe'

    ; Удаляем файлы
    RMDir /r "$INSTDIR"

    ; Удаляем ярлыки
    Delete "$DESKTOP\RobBob.lnk"
    RMDir /r "$SMPROGRAMS\RobBob"

    ; Удаляем из реестра
    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RobBob"
SectionEnd
