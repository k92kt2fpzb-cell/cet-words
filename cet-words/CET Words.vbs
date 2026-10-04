' CET Words launcher: make sure the local server is listening, then open an app-style window.
Option Explicit

Dim shell, fso, root, port, url, nodeDir, nodeExe, nextBin, logFile, cmd, i, browser

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

root = fso.GetParentFolderName(WScript.ScriptFullName)
port = 3100
url = "http://127.0.0.1:" & port
nodeDir = "C:\Users\Lenovo\.cache\nodejs-lts"
nodeExe = nodeDir & "\node.exe"
nextBin = root & "\node_modules\next\dist\bin\next"
logFile = shell.ExpandEnvironmentStrings("%TEMP%") & "\cet-words-server.log"

If Not PortListening(port) Then
  If Not fso.FileExists(nodeExe) Then
    MsgBox "Node.js not found: " & nodeExe, 16, "CET Words"
    WScript.Quit 1
  End If
  cmd = "cmd /c cd /d """ & root & """ && """ & nodeExe & """ """ & nextBin & """ start -p " & port & " >> """ & logFile & """ 2>&1"
  shell.Run cmd, 0, False
  For i = 1 To 40
    WScript.Sleep 750
    If PortListening(port) Then Exit For
  Next
End If

If Not PortListening(port) Then
  MsgBox "The app server did not start in time. Log: " & logFile, 48, "CET Words"
End If

browser = FindBrowser(fso)
Dim launcherLog, logHandle
launcherLog = shell.ExpandEnvironmentStrings("%TEMP%") & "\cet-words-launcher.log"
On Error Resume Next
Set logHandle = fso.OpenTextFile(launcherLog, 8, True)
logHandle.WriteLine Now & "  browser=" & browser & "  port=" & port
logHandle.Close
On Error GoTo 0

If browser = "" Then
  shell.Run url, 1, False
Else
  shell.Run """" & browser & """ --app=" & url & " --window-size=1200,840 --window-position=100,50", 1, False
End If

' ??????? HTTP/???????????????????
Function PortListening(p)
  Dim exec, line, found
  found = False
  On Error Resume Next
  Set exec = shell.Exec("cmd /c netstat -ano -p tcp")
  Do While Not exec.StdOut.AtEndOfStream
    line = exec.StdOut.ReadLine
    If Not found Then
      If InStr(line, ":" & p & " ") > 0 And InStr(line, "LISTENING") > 0 Then found = True
    End If
  Loop
  PortListening = found
  On Error GoTo 0
End Function

Function FindBrowser(f)
  Dim list, k
' ???????? SLBrowserHTML?? Edge/Chrome?????????????? Edge???? Chrome
  list = Array( _
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", _
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe", _
    "C:\Program Files\Google\Chrome\Application\chrome.exe", _
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe")
  FindBrowser = ""
  For k = 0 To UBound(list)
    If f.FileExists(list(k)) Then
      FindBrowser = list(k)
      Exit Function
    End If
  Next
End Function
