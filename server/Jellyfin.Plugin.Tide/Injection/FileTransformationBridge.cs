using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Tide.Injection;

public sealed class PatchPayload
{
    [JsonPropertyName("contents")]
    public string? Contents { get; set; }
}

/// <summary>Registers an index.html transformation with the optional File Transformation plugin via reflection.</summary>
public static class FileTransformationBridge
{
    public static readonly Guid TransformationId = Guid.Parse("b4c1f0a2-6d3e-4f7a-9c8b-2e5d1a0f3c7b");

    public static bool TryRegister(ILogger logger)
    {
        try
        {
            var asm = AssemblyLoadContext.All.SelectMany(c => c.Assemblies)
                .FirstOrDefault(a => a.FullName?.Contains(".FileTransformation", StringComparison.Ordinal) == true);
            var iface = asm?.GetType("Jellyfin.Plugin.FileTransformation.PluginInterface");
            var register = iface?.GetMethod("RegisterTransformation", BindingFlags.Public | BindingFlags.Static);
            if (register is null)
            {
                return false;
            }

            var payload = new JsonObject
            {
                ["id"] = TransformationId.ToString(),
                ["fileNamePattern"] = "index.html",
                ["callbackAssembly"] = typeof(FileTransformationBridge).Assembly.FullName,
                ["callbackClass"] = typeof(FileTransformationBridge).FullName,
                ["callbackMethod"] = nameof(Transform),
            };
            var paramType = register.GetParameters().Single().ParameterType;
            object arg = paramType == typeof(JsonObject)
                ? payload
                : paramType.GetMethod("Parse", new[] { typeof(string) })?.Invoke(null, new object[] { payload.ToJsonString() })
                  ?? throw new InvalidOperationException("Unsupported File Transformation payload type " + paramType);
            register.Invoke(null, new[] { arg });
            logger.LogInformation("[Tide] Registered index.html transformation with File Transformation");
            return true;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[Tide] File Transformation registration failed, falling back to direct patch");
            return false;
        }
    }

    public static string Transform(PatchPayload payload) =>
        IndexPatcher.Patch(payload.Contents ?? string.Empty, Plugin.Instance?.Version.ToString(3) ?? "0");
}
