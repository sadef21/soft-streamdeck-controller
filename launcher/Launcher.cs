// «Stream Controller X.exe» — запуск утилиты двойным кликом.
// Если утилита уже работает, просто открывает конфигуратор. Иначе запускает node bind.js без окна
// (журнал — bind.log), ждёт, пока поднимется конфигуратор, и открывает его в браузере.
// С ключом --background браузер не открывается (для автозапуска).
// Сборка: launcher\build.ps1
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("Stream Controller X")]
[assembly: System.Reflection.AssemblyProduct("streamx-bind")]

static class Launcher
{
    const string Title = "Stream Controller X";
    const int Port = 3210;
    const string Url = "http://127.0.0.1:3210/";

    [STAThread]
    static int Main(string[] args)
    {
        bool background = args.Contains("--background");
        string dir = AppDomain.CurrentDomain.BaseDirectory;

        if (IsRunning())
        {
            if (!background) Open(Url);
            return 0;
        }

        if (!File.Exists(Path.Combine(dir, "bind.js")))
            return Fail("Рядом с программой нет bind.js. Запускайте её из папки утилиты.");

        string node = FindNode(dir);
        if (node == null)
            return Fail("Не найден Node.js. Установите его с https://nodejs.org (версия 20 или новее) и запустите снова.");

        if (!Directory.Exists(Path.Combine(dir, "node_modules")))
        {
            var answer = MessageBox.Show(
                "Не установлены зависимости утилиты. Установить сейчас? Понадобится интернет и около минуты.",
                Title, MessageBoxButtons.OKCancel, MessageBoxIcon.Question);
            if (answer != DialogResult.OK) return 1;
            if (!InstallDependencies(dir, node))
                return Fail("Не удалось установить зависимости. Откройте папку утилиты в терминале и выполните: npm install");
        }

        var start = new ProcessStartInfo(node, "bind.js --log")
        {
            WorkingDirectory = dir,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        Process child;
        try { child = Process.Start(start); }
        catch (Exception err) { return Fail("Не удалось запустить утилиту: " + err.Message); }

        // Ждём конфигуратор до 20 секунд. Если node закрылся раньше — что-то не так, показываем журнал
        for (int i = 0; i < 80; i++)
        {
            if (IsRunning())
            {
                if (!background) Open(Url);
                return 0;
            }
            if (child.HasExited) break;
            Thread.Sleep(250);
        }
        if (background) return 1;
        var log = Path.Combine(dir, "bind.log");
        var show = MessageBox.Show("Утилита не запустилась. Открыть журнал bind.log, чтобы посмотреть причину?",
            Title, MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
        if (show == DialogResult.Yes && File.Exists(log)) Open(log);
        return 1;
    }

    // Конфигуратор отвечает на порту — значит, утилита уже запущена
    static bool IsRunning()
    {
        try
        {
            using (var client = new TcpClient())
            {
                var connect = client.BeginConnect("127.0.0.1", Port, null, null);
                if (!connect.AsyncWaitHandle.WaitOne(300)) return false;
                client.EndConnect(connect);
                return true;
            }
        }
        catch { return false; }
    }

    // node.exe: рядом с программой (переносная версия), в PATH или в стандартной папке установки
    static string FindNode(string dir)
    {
        var candidates = new[] { Path.Combine(dir, "node.exe"), Path.Combine(dir, "node", "node.exe") }
            .Concat((Environment.GetEnvironmentVariable("PATH") ?? "")
                .Split(Path.PathSeparator)
                .Where(p => p.Trim().Length > 0)
                .Select(p => { try { return Path.Combine(p.Trim().Trim('"'), "node.exe"); } catch { return null; } }))
            .Concat(new[] {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "nodejs", "node.exe"),
            });
        return candidates.FirstOrDefault(p => p != null && File.Exists(p));
    }

    // npm install в видимом окне, чтобы было видно, что идёт установка
    static bool InstallDependencies(string dir, string node)
    {
        string npm = Path.Combine(Path.GetDirectoryName(node), "npm.cmd");
        string command = File.Exists(npm) ? "\"" + npm + "\"" : "npm";
        try
        {
            var install = Process.Start(new ProcessStartInfo("cmd.exe", "/c \"" + command + " install || (pause & exit /b 1)\"")
            {
                WorkingDirectory = dir,
                UseShellExecute = false,
            });
            install.WaitForExit();
            return install.ExitCode == 0 && Directory.Exists(Path.Combine(dir, "node_modules"));
        }
        catch { return false; }
    }

    static void Open(string target)
    {
        try { Process.Start(new ProcessStartInfo(target) { UseShellExecute = true }); } catch { }
    }

    static int Fail(string message)
    {
        MessageBox.Show(message, Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
        return 1;
    }
}
