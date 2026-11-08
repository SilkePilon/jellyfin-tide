using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Tide.Injection;

public sealed class ScriptInjector : IHostedService
{
    private readonly IApplicationPaths _paths;
    private readonly ILogger<ScriptInjector> _logger;

    public ScriptInjector(IApplicationPaths paths, ILogger<ScriptInjector> logger)
    {
        _paths = paths;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (FileTransformationBridge.TryRegister(_logger))
        {
            Unpatch(_paths, _logger); // remove any old direct patch
            return Task.CompletedTask;
        }

        var index = Path.Combine(_paths.WebPath, "index.html");
        try
        {
            var html = File.ReadAllText(index);
            var patched = IndexPatcher.Patch(html, Plugin.Instance?.Version.ToString(3) ?? "0");
            if (patched != html)
            {
                WriteAtomic(index, patched);
            }

            _logger.LogInformation("[Tide] Patched {Index}", index);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Tide] Could not patch {Index}. Install the File Transformation plugin or make the web folder writable.", index);
        }

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    /// <summary>Write via a sibling temp file and an atomic rename, so jellyfin-web never serves a half-written index.html.</summary>
    internal static void WriteAtomic(string path, string content)
    {
        var tmp = Path.Combine(Path.GetDirectoryName(path) ?? ".", $".{Path.GetFileName(path)}.tide-{Guid.NewGuid():N}.tmp");
        try
        {
            File.WriteAllText(tmp, content);
            File.Move(tmp, path, overwrite: true);
        }
        finally
        {
            if (File.Exists(tmp))
            {
                File.Delete(tmp);
            }
        }
    }

    public static void Unpatch(IApplicationPaths paths, ILogger logger)
    {
        var index = Path.Combine(paths.WebPath, "index.html");
        try
        {
            if (File.Exists(index))
            {
                var html = File.ReadAllText(index);
                var clean = IndexPatcher.Unpatch(html);
                if (clean != html)
                {
                    WriteAtomic(index, clean);
                }
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[Tide] Could not unpatch {Index}", index);
        }
    }
}
