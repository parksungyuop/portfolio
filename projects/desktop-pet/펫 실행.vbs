' Runs the desktop pet with no console window.
Option Explicit
Dim sh, fso, base, pyw, cmd
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
pyw = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\Python\Python312\pythonw.exe"
If Not fso.FileExists(pyw) Then pyw = "pythonw.exe"
sh.CurrentDirectory = base
cmd = Chr(34) & pyw & Chr(34) & " " & Chr(34) & base & "\main.py" & Chr(34)
sh.Run cmd, 0, False
