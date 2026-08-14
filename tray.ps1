# DeepSeek Harness 托盘图标：一个图标完成 打开 / 停止 / 退出
# 左键双击 = 打开；右键菜单 = 打开 / 停止服务 / 退出
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dshMjs = Join-Path $scriptDir 'dsh.mjs'
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = 'node' }

function Invoke-Dsh([string]$command) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $node
    $psi.Arguments = '"' + $dshMjs + '" ' + $command
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    try {
        [void][System.Diagnostics.Process]::Start($psi)
    } catch {
        [System.Windows.Forms.MessageBox]::Show(
            '无法运行 node：' + $_.Exception.Message + "`n请确认已安装 Node.js 并加入 PATH。",
            'DeepSeek Harness')
    }
}

$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = [System.Drawing.SystemIcons]::Application
$tray.Text = 'DeepSeek Harness'
$tray.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$open = New-Object System.Windows.Forms.ToolStripMenuItem
$open.Text = '打开 DeepSeek Harness'
$open.Add_Click({ Invoke-Dsh 'start' })
[void]$menu.Items.Add($open)

$stop = New-Object System.Windows.Forms.ToolStripMenuItem
$stop.Text = '停止服务'
$stop.Add_Click({ Invoke-Dsh 'stop' })
[void]$menu.Items.Add($stop)

[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

$exit = New-Object System.Windows.Forms.ToolStripMenuItem
$exit.Text = '退出'
$exit.Add_Click({
    $tray.Visible = $false
    $tray.Dispose()
    [System.Windows.Forms.Application]::Exit()
})
[void]$menu.Items.Add($exit)

$tray.ContextMenuStrip = $menu
$tray.Add_DoubleClick({
    if ($_.Button -eq [System.Windows.Forms.MouseButtons]::Left) { Invoke-Dsh 'start' }
})

[System.Windows.Forms.Application]::Run()
