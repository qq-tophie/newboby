# RobBob Launcher Bootstrapper
# Маленький загрузчик который скачивает и запускает лаунчер
# Конвертируется в .exe с помощью ps2exe (~2MB)

param(
    [switch]$Silent
)

# ============================================
# НАСТРОЙКИ
# ============================================
$AppName = "RobBob Launcher"
$InstallDir = "$env:LOCALAPPDATA\RobBob"
$ExePath = "$InstallDir\RobBob.exe"

# GitHub Release URL
$GitHubOwner = "yamineki"
$GitHubRepo = "roboby-releases"
$DownloadUrl = "https://github.com/$GitHubOwner/$GitHubRepo/releases/latest/download/RobBob-Full.zip"

# ============================================
# GUI ФУНКЦИИ
# ============================================
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Show-ProgressWindow {
    param([string]$Title, [string]$Status)

    $form = New-Object System.Windows.Forms.Form
    $form.Text = $Title
    $form.Size = New-Object System.Drawing.Size(400, 180)
    $form.StartPosition = "CenterScreen"
    $form.FormBorderStyle = "FixedDialog"
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.BackColor = [System.Drawing.Color]::FromArgb(26, 27, 46)

    # Logo
    $logo = New-Object System.Windows.Forms.Label
    $logo.Text = "ROBBOB"
    $logo.Font = New-Object System.Drawing.Font("Segoe UI", 24, [System.Drawing.FontStyle]::Bold)
    $logo.ForeColor = [System.Drawing.Color]::White
    $logo.AutoSize = $true
    $logo.Location = New-Object System.Drawing.Point(130, 20)
    $form.Controls.Add($logo)

    # Status label
    $statusLabel = New-Object System.Windows.Forms.Label
    $statusLabel.Name = "StatusLabel"
    $statusLabel.Text = $Status
    $statusLabel.Font = New-Object System.Drawing.Font("Segoe UI", 10)
    $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(200, 200, 200)
    $statusLabel.AutoSize = $true
    $statusLabel.Location = New-Object System.Drawing.Point(20, 70)
    $form.Controls.Add($statusLabel)

    # Progress bar
    $progressBar = New-Object System.Windows.Forms.ProgressBar
    $progressBar.Name = "ProgressBar"
    $progressBar.Location = New-Object System.Drawing.Point(20, 100)
    $progressBar.Size = New-Object System.Drawing.Size(345, 20)
    $progressBar.Style = "Continuous"
    $form.Controls.Add($progressBar)

    return $form
}

function Update-Progress {
    param($Form, [int]$Percent, [string]$Status)

    $progressBar = $Form.Controls["ProgressBar"]
    $statusLabel = $Form.Controls["StatusLabel"]

    if ($progressBar) { $progressBar.Value = [Math]::Min($Percent, 100) }
    if ($statusLabel) { $statusLabel.Text = $Status }
    $Form.Refresh()
}

# ============================================
# ОСНОВНАЯ ЛОГИКА
# ============================================
function Main {
    # Проверяем, установлен ли уже лаунчер
    if (Test-Path $ExePath) {
        # Лаунчер уже установлен - просто запускаем
        Start-Process $ExePath
        exit 0
    }

    # Показываем окно загрузки
    $form = Show-ProgressWindow -Title $AppName -Status "Подготовка к загрузке..."
    $form.Show()
    $form.Refresh()

    try {
        # Создаём папку установки
        Update-Progress -Form $form -Percent 5 -Status "Создание папки установки..."
        if (-not (Test-Path $InstallDir)) {
            New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
        }

        # Скачиваем архив
        Update-Progress -Form $form -Percent 10 -Status "Загрузка лаунчера..."
        $zipPath = "$env:TEMP\RobBob-Full.zip"

        # Используем WebClient для отслеживания прогресса
        $webClient = New-Object System.Net.WebClient

        # Событие прогресса
        $webClient.add_DownloadProgressChanged({
            param($sender, $e)
            $percent = 10 + [int]($e.ProgressPercentage * 0.6)
            Update-Progress -Form $form -Percent $percent -Status "Загрузка: $($e.ProgressPercentage)%"
        })

        # Скачиваем асинхронно
        $downloadTask = $webClient.DownloadFileTaskAsync($DownloadUrl, $zipPath)

        while (-not $downloadTask.IsCompleted) {
            [System.Windows.Forms.Application]::DoEvents()
            Start-Sleep -Milliseconds 100
        }

        if ($downloadTask.IsFaulted) {
            throw $downloadTask.Exception.InnerException
        }

        # Распаковываем
        Update-Progress -Form $form -Percent 75 -Status "Распаковка файлов..."
        Expand-Archive -Path $zipPath -DestinationPath $InstallDir -Force

        # Удаляем временный архив
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

        # Создаём ярлык на рабочем столе
        Update-Progress -Form $form -Percent 90 -Status "Создание ярлыков..."
        $WshShell = New-Object -ComObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\RobBob.lnk")
        $Shortcut.TargetPath = $ExePath
        $Shortcut.Save()

        # Готово
        Update-Progress -Form $form -Percent 100 -Status "Установка завершена!"
        Start-Sleep -Seconds 1

        $form.Close()

        # Запускаем лаунчер
        if (Test-Path $ExePath) {
            Start-Process $ExePath
        } else {
            [System.Windows.Forms.MessageBox]::Show(
                "Лаунчер установлен в: $InstallDir",
                $AppName,
                [System.Windows.Forms.MessageBoxButtons]::OK,
                [System.Windows.Forms.MessageBoxIcon]::Information
            )
        }

    } catch {
        $form.Close()
        [System.Windows.Forms.MessageBox]::Show(
            "Ошибка установки: $($_.Exception.Message)`n`nПроверьте интернет-соединение и попробуйте снова.",
            $AppName,
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        )
        exit 1
    }
}

# Запуск
Main
