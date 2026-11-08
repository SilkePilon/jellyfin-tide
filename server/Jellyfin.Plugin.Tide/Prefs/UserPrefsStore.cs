using System.Text.Json;
using Jellyfin.Plugin.Tide.Models;

namespace Jellyfin.Plugin.Tide.Prefs;

public sealed class UserPrefsStore
{
    private readonly string _directory;
    private readonly object _lock = new();

    public UserPrefsStore(string directory)
    {
        _directory = directory;
    }

    public UserPrefs Load(Guid userId, string[] defaultOrder, string[] defaultHidden)
    {
        var path = PathFor(userId);
        lock (_lock)
        {
            if (File.Exists(path))
            {
                try
                {
                    var p = JsonSerializer.Deserialize<UserPrefs>(File.ReadAllText(path));
                    if (p is { Edited: true })
                    {
                        return Normalize(p);
                    }
                }
                catch (Exception ex) when (ex is JsonException or IOException or UnauthorizedAccessException)
                {
                    // fall through to defaults
                }
            }
        }

        return Normalize(new UserPrefs { RowOrder = defaultOrder, Hidden = defaultHidden, Edited = false });
    }

    public void Save(Guid userId, UserPrefs prefs)
    {
        var normalized = Normalize(prefs);
        normalized.Edited = true;
        lock (_lock)
        {
            Directory.CreateDirectory(_directory);
            var tmp = PathFor(userId) + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(normalized));
            File.Move(tmp, PathFor(userId), true);
        }
    }

    public static UserPrefs Normalize(UserPrefs p)
    {
        var known = new HashSet<string>(RowIds.All);
        var order = (p.RowOrder ?? Array.Empty<string>()).Where(known.Contains).Distinct().ToList();
        order.AddRange(RowIds.All.Where(id => !order.Contains(id)));
        return new UserPrefs
        {
            RowOrder = order.ToArray(),
            Hidden = (p.Hidden ?? Array.Empty<string>()).Where(known.Contains).Distinct().ToArray(),
            Genres = (p.Genres ?? new()).Where(kv => RowIds.Genres.Contains(kv.Key)).ToDictionary(kv => kv.Key, kv => kv.Value),
            Edited = p.Edited,
        };
    }

    private string PathFor(Guid userId) => Path.Combine(_directory, userId.ToString("N") + ".json");
}
