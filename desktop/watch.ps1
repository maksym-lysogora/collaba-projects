# Activity watcher for Collaba Projects auto-tracking. Every 5 s prints one JSON line:
#   t = title of the foreground window, p = its process name, i = ms since the last keyboard/mouse input,
#   q = Windows "user notification state": 2 = busy (fullscreen app), 3 = fullscreen Direct3D game,
#       4 = presentation mode, 5 = normal.
# Read-only: no screenshots, no focus changes, nothing that could interrupt a game.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class CollabaWatch {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO p);
  [DllImport("shell32.dll")] public static extern int SHQueryUserNotificationState(out int state);
  public static uint IdleMs() { var l = new LASTINPUTINFO(); l.cbSize = 8; GetLastInputInfo(ref l); return (uint)Environment.TickCount - l.dwTime; }
}
"@
while ($true) {
  $h = [CollabaWatch]::GetForegroundWindow()
  $sb = New-Object Text.StringBuilder 512
  [void][CollabaWatch]::GetWindowText($h, $sb, 512)
  $procId = [uint32]0
  [void][CollabaWatch]::GetWindowThreadProcessId($h, [ref]$procId)
  $name = ''
  try { $name = (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch {}
  $q = 0
  [void][CollabaWatch]::SHQueryUserNotificationState([ref]$q)
  $line = @{ t = $sb.ToString(); p = $name; i = [CollabaWatch]::IdleMs(); q = $q } | ConvertTo-Json -Compress
  [Console]::Out.WriteLine($line)
  [Console]::Out.Flush()
  Start-Sleep -Seconds 5
}
