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
        // Rows missing from a saved order (e.g. sections added in a newer version) slot in right after their nearest
        // preceding row in the built-in order, so an upgrade puts them where they belong instead of at the bottom.
        for (var i = 0; i < RowIds.All.Count; i++)
        {
            var id = RowIds.All[i];
            if (order.Contains(id))
            {
                continue;
            }

            var at = 0;
            for (var j = i - 1; j >= 0; j--)
            {
                var prev = order.IndexOf(RowIds.All[j]);
                if (prev >= 0)
                {
                    at = prev + 1;
                    break;
                }
            }

            order.Insert(at, id);
        }
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
