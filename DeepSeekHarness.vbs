' DeepSeek Harness - system tray launcher (single icon, no console window)
Option Explicit
Dim fso, shell, dir, cmd

Function q(s)
  q = Chr(34) & s & Chr(34)
End Function

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = q("powershell") & " -STA -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & q(dir & "\tray.ps1")
shell.Run cmd, 0, False
