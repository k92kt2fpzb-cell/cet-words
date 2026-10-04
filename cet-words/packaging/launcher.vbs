' CET Words launcher (portable version)
' Keeps the local server running in the background, then opens an app-style window.
' Need a different port? Edit the line:  port = 3100
Option Explicit

Dim shell, fso, root, port, url, appDir, nodeExe, serverJs, logFile, cmd, i, browser, noBrowser

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

root = fso.GetParentFolderName(WScript.ScriptFullName)
port = 3100
url = "http://127.0.0.1:" & port
appDir = root & "\app"
nodeExe = root & "\node\node.exe"
serverJs = appDir & "\server.js"
logFile = shell.ExpandEnvironmentStrings("%TEMP%") & "\cet-words-server.log"

If Not fso.FileExists(nodeExe) Then
  MsgBox "Runtime not found:" & vbCrLf & nodeExe & vbCrLf & vbCrLf & _
         "Please extract the whole ZIP first (do not run inside the archive).", 16, "CET Words"
  WScript.Quit 1
End If

If Not fso.FileExists(serverJs) Then
  MsgBox "Program files not found:" & vbCrLf & serverJs & vbCrLf & vbCrLf & _
         "The folder may be incomplete. Please re-extract the ZIP.", 16, "CET Words"
  WScript.Quit 1
End If

If Not PortListening(port) Then
  ' Check for updates before starting (silent; failure never blocks startup; log: %TEMP%\cet-words-update.log)
  On Error Resume Next
  shell.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & root & "\tools\update.ps1"" -Quiet", 0, True
  On Error GoTo 0

  cmd = "cmd /c set PORT=" & port & "&& cd /d """ & appDir & """ && """ & nodeExe & """ server.js >> """ & logFile & """ 2>&1"
  shell.Run cmd, 0, False
  For i = 1 To 40
    WScript.Sleep 750
    If PortListening(port) Then Exit For
  Next
End If

If Not PortListening(port) Then
  MsgBox "The app server did not start on port " & port & "." & vbCrLf & vbCrLf & _
         "Log file: " & logFile & vbCrLf & _
         "Tip: another program may already be using this port.", 48, "CET Words"
  WScript.Quit 1
End If

noBrowser = False
If WScript.Arguments.Unnamed.Count > 0 Then
  noBrowser = (LCase(WScript.Arguments.Unnamed(0)) = "nobrowser")
End If
browser = FindBrowser(fso)
If noBrowser Then
  ' test mode: start the server only, do not open the window
  WScript.Quit 0
ElseIf browser = "" Then
  shell.Run url, 1, False
Else
  shell.Run """" & browser & """ --app=" & url & " --window-size=1200,840 --window-position=100,50", 1, False
End If

' Is the port already listening? (no HTTP / proxy involved)
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

' Prefer the browser that is actually installed: Edge first, then Chrome
Function FindBrowser(f)
  Dim list, k
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
