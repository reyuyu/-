using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

namespace FenbiHelperLauncher
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string launcherPath = Path.Combine(appDir, "src", "launcher.js");

            if (!File.Exists(launcherPath))
            {
                MessageBox.Show(
                    "Cannot find src\\launcher.js. Please keep FenbiHelper.exe in the project root folder.",
                    "Fenbi Helper",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return;
            }

            string nodePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                "nodejs",
                "node.exe"
            );

            if (!File.Exists(nodePath))
            {
                nodePath = "node.exe";
            }

            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = nodePath,
                    Arguments = Quote(launcherPath),
                    WorkingDirectory = appDir,
                    UseShellExecute = true
                });
            }
            catch (Exception error)
            {
                MessageBox.Show(
                    "Failed to start Node.js. Please install Node.js first.\n\n" + error.Message,
                    "Fenbi Helper",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        private static string Quote(string value)
        {
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }
    }
}
