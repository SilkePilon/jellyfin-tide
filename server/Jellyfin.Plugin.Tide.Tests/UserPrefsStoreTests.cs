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
        Assert.True(Array.IndexOf(p.RowOrder, "topRated") < Array.IndexOf(p.RowOrder, "continue"));
        Assert.Equal(15, p.RowOrder.Length);
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
        Assert.Equal("random", p.RowOrder[0]);
        Assert.True(Array.IndexOf(p.RowOrder, "random") < Array.IndexOf(p.RowOrder, "continue"));
        Assert.Equal(15, p.RowOrder.Length);
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
        Assert.Equal(15, p.RowOrder.Length);
    }

    [Fact]
    public void NewRowsSlotInAtTheirBuiltInPositionOnUpgrade()
    {
        // A 0.1.0 order (no newThisWeek), user-customised: random first.
        var old = new[] { "random", "continue", "nextUp", "latestMovies", "latestShows", "becauseYouWatched", "topRated", "genre1", "genre2", "genre3", "favourites", "collections", "musicAlbums", "musicArtists" };
        var p = UserPrefsStore.Normalize(new UserPrefs { RowOrder = old });
        Assert.Equal(15, p.RowOrder.Length);
        Assert.Equal(Array.IndexOf(p.RowOrder, "nextUp") + 1, Array.IndexOf(p.RowOrder, "newThisWeek"));
        Assert.Equal("random", p.RowOrder[0]);
    }

    [Fact]
    public void RemovedDiscoverRowIsDroppedFromSavedPrefs()
    {
        // 0.2.0 - 0.4.x shipped a "discover" row; 0.5.0 removed it.
        var saved = RowIds.All.Take(5).Append("discover").Concat(RowIds.All.Skip(5)).ToArray();
        var p = UserPrefsStore.Normalize(new UserPrefs { RowOrder = saved, Hidden = new[] { "discover", "random" } });
        Assert.DoesNotContain("discover", p.RowOrder);
        Assert.Equal(new[] { "random" }, p.Hidden);
        Assert.Equal(15, p.RowOrder.Length);
    }
}
