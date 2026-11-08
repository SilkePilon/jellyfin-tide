using Jellyfin.Plugin.Tide.Models;
using Jellyfin.Plugin.Tide.Prefs;
using Xunit;

namespace Jellyfin.Plugin.Tide.Tests;

public sealed class UserPrefsStoreTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "tide-" + Guid.NewGuid());

    public void Dispose()
    {
        if (Directory.Exists(_dir))
        {
            Directory.Delete(_dir, true);
        }
    }

    [Fact]
    public void NoFileReturnsDefaults()
    {
        var store = new UserPrefsStore(_dir);
        var p = store.Load(Guid.NewGuid(), new[] { "topRated", "continue" }, new[] { "random" });
        Assert.Equal("topRated", p.RowOrder[0]);
        Assert.Equal("continue", p.RowOrder[1]);
        Assert.Equal(14, p.RowOrder.Length);
        Assert.Equal(new[] { "random" }, p.Hidden);
        Assert.False(p.Edited);
    }

    [Fact]
    public void SaveThenLoadRoundTrips()
    {
        var store = new UserPrefsStore(_dir);
        var id = Guid.NewGuid();
        store.Save(id, new UserPrefs { RowOrder = new[] { "random", "continue" }, Hidden = new[] { "collections" }, Genres = new() { ["genre1"] = "Sci-Fi" }, Edited = true });
        var p = store.Load(id, RowIds.All.ToArray(), Array.Empty<string>());
        Assert.Equal("random", p.RowOrder[0]);
        Assert.Equal(new[] { "collections" }, p.Hidden);
        Assert.Equal("Sci-Fi", p.Genres["genre1"]);
        Assert.True(p.Edited);
    }

    [Fact]
    public void NormalizeDropsUnknownAndDuplicatesAndAppendsMissing()
    {
        var p = UserPrefsStore.Normalize(new UserPrefs
        {
            RowOrder = new[] { "random", "bogus", "random", "continue" },
            Hidden = new[] { "bogus", "collections", "collections" },
            Genres = new() { ["genre1"] = "Drama", ["evil"] = "x" },
        });
        Assert.Equal(new[] { "random", "continue" }, p.RowOrder.Take(2));
        Assert.Equal(14, p.RowOrder.Length);
        Assert.Equal(new[] { "collections" }, p.Hidden);
        Assert.False(p.Genres.ContainsKey("evil"));
    }

    [Fact]
    public void CorruptFileFallsBackToDefaults()
    {
        var store = new UserPrefsStore(_dir);
        var id = Guid.NewGuid();
        Directory.CreateDirectory(_dir);
        File.WriteAllText(Path.Combine(_dir, id.ToString("N") + ".json"), "{not json");
        Assert.False(store.Load(id, RowIds.All.ToArray(), Array.Empty<string>()).Edited);
    }

    [Fact]
    public void UnreadableFileFallsBackToDefaults()
    {
        // Root ignores Unix permission bits, and Windows has no Unix modes.
        if (Environment.UserName == "root" || OperatingSystem.IsWindows())
        {
            return;
        }

        var store = new UserPrefsStore(_dir);
        var id = Guid.NewGuid();
        Directory.CreateDirectory(_dir);
        var path = Path.Combine(_dir, id.ToString("N") + ".json");
        File.WriteAllText(path, "{\"Edited\":true}");
        File.SetUnixFileMode(path, UnixFileMode.None);

        var p = store.Load(id, RowIds.All.ToArray(), Array.Empty<string>());
        Assert.False(p.Edited);
        Assert.Equal(14, p.RowOrder.Length);
    }
}
