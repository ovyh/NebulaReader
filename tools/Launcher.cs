using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;

// 星云阅读器 · Windows 单文件启动器
// 首次运行把内嵌的 app.zip 解压到 %LOCALAPPDATA%\NebulaReader\app，
// 然后用系统浏览器以“无地址栏应用窗口”打开，并固定用户数据目录。
public static class Launcher
{
    private const string AppVersion = "1.0.0";
    private const string AppFolderName = "NebulaReader";

    [STAThread]
    public static void Main()
    {
        Log("start");
        try
        {
            string appDir = EnsurePayload();
            Log("payload ok: " + appDir);
            string index = Path.Combine(appDir, "index.html");
            if (!File.Exists(index))
            {
                MessageBox.Show("应用文件缺失，请重新下载安装包。", "星云阅读器",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            string browser = FindBrowser();
            if (browser == null)
            {
                MessageBox.Show("没有找到 Chrome 或 Edge，请先安装其中一个浏览器。", "星云阅读器",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            string profile = Path.Combine(BaseDir(), "profile");
            Directory.CreateDirectory(profile);
            EnsureShortcut();

            string url = new Uri(index).AbsoluteUri;
            string args = "--app=\"" + url + "\""
                + " --user-data-dir=\"" + profile + "\""
                + " --window-size=1280,820"
                + " --no-first-run --no-default-browser-check"
                + " --allow-file-access-from-files"
                + " --disable-features=msEdgeTranslate";

            Process.Start(new ProcessStartInfo(browser, args) { UseShellExecute = false });
        }
        catch (Exception ex)
        {
            Log("error: " + ex);
            MessageBox.Show("启动失败：" + ex.ToString(), "星云阅读器",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static void Log(string msg)
    {
        try
        {
            Directory.CreateDirectory(BaseDir()); File.AppendAllText(Path.Combine(BaseDir(), "launcher.log"),
                DateTime.Now.ToString("HH:mm:ss") + " " + msg + Environment.NewLine);
        }
        catch { }
    }

    private static string BaseDir()
    {
        string root = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string dir = Path.Combine(root, AppFolderName);
        // 旧版本目录名迁移（保留已导入的数据）
        string legacy = Path.Combine(root, "NebulaTextReader");
        try
        {
            if (!Directory.Exists(dir) && Directory.Exists(legacy)) Directory.Move(legacy, dir);
        }
        catch { }
        return dir;
    }

    private static string EnsurePayload()
    {
        string baseDir = BaseDir();
        string appDir = Path.Combine(baseDir, "app-" + AppVersion);

        if (File.Exists(Path.Combine(appDir, "index.html")))
        {
            return appDir;
        }

        Assembly asm = Assembly.GetExecutingAssembly();
        string resName = null;
        foreach (string n in asm.GetManifestResourceNames())
        {
            if (n.EndsWith(".zip", StringComparison.OrdinalIgnoreCase)) { resName = n; break; }
        }
        if (resName == null) throw new InvalidOperationException("安装包内缺少应用数据");

        Directory.CreateDirectory(appDir);

        using (Stream s = asm.GetManifestResourceStream(resName))
        using (ZipArchive zip = new ZipArchive(s, ZipArchiveMode.Read))
        {
            foreach (ZipArchiveEntry entry in zip.Entries)
            {
                string target = Path.Combine(appDir, entry.FullName.Replace('/', Path.DirectorySeparatorChar));
                if (entry.FullName.EndsWith("/")) { Directory.CreateDirectory(target); continue; }
                Directory.CreateDirectory(Path.GetDirectoryName(target));
                entry.ExtractToFile(target, true);
            }
        }

        return appDir;
    }

    private static string FindBrowser()
    {
        string[] candidates = new string[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                @"Google\Chrome\Application\chrome.exe")
        };

        foreach (string path in candidates)
        {
            if (File.Exists(path)) return path;
        }

        string chrome = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            @"Google\Chrome\Application\chrome.exe");
        return File.Exists(chrome) ? chrome : null;
    }

    private static void EnsureShortcut()
    {
        try
        {
            string exe = Assembly.GetExecutingAssembly().Location;
            string link = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                "星云阅读器.lnk");

            if (File.Exists(link)) return;

            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType == null) return;
            object shell = Activator.CreateInstance(shellType);
            object shortcut = shellType.InvokeMember("CreateShortcut",
                BindingFlags.InvokeMethod, null, shell, new object[] { link });
            Type t = shortcut.GetType();
            t.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { exe });
            t.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut,
                new object[] { Path.GetDirectoryName(exe) });
            t.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { exe + ",0" });
            t.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut,
                new object[] { "星云阅读器 · NEBULA READER" });
            t.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
        }
        catch
        {
            // 快捷方式失败不影响启动
        }
    }
}
