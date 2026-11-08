using System.Text.Json;
using Jellyfin.Plugin.Tide.Hero;
using Jellyfin.Plugin.Tide.Models;
using Xunit;

namespace Jellyfin.Plugin.Tide.Tests;

public class HeroServiceTests
{
    [Theory]
    [InlineData("https://www.youtube.com/watch?v=Klc__shdj88", "Klc__shdj88")]
    [InlineData("https://youtu.be/Klc__shdj88", "Klc__shdj88")]
    [InlineData(null, null)]
    [InlineData("https://vimeo.com/1", null)]
    [InlineData("https://www.youtube.com/embed/abcdefghij-", "abcdefghij-")]
    [InlineData("https://www.youtube.com/watch?v=ééééééééééé", null)]
    public void YoutubeId(string? url, string? expected) => Assert.Equal(expected, HeroService.YoutubeId(url));

    [Theory]
    [InlineData(0L, 100L, null, null)]
    [InlineData(50L, 0L, null, null)]
    [InlineData(30L * 600_000_000, 60L * 600_000_000, 50, 30)]
    [InlineData(90L * 600_000_000, 60L * 600_000_000, 100, 0)]
    public void ProgressIsClamped(long pos, long runtime, int? pct, int? left)
    {
        var p = HeroService.Progress(pos, runtime == 0 ? null : runtime);
        Assert.Equal(pct, p?.Percent);
        Assert.Equal(left, p?.MinutesLeft);
    }

    [Fact]
    public void HeroDtoSerializesThumbAndFavouriteAsCamelCase()
    {
        var json = JsonSerializer.Serialize(new HeroItemDto { HasThumb = true, IsFavorite = true });
        using var doc = JsonDocument.Parse(json);
        Assert.True(doc.RootElement.GetProperty("hasThumb").GetBoolean());
        Assert.True(doc.RootElement.GetProperty("isFavorite").GetBoolean());

        var off = JsonDocument.Parse(JsonSerializer.Serialize(new HeroItemDto())).RootElement;
        Assert.False(off.GetProperty("hasThumb").GetBoolean());
        Assert.False(off.GetProperty("isFavorite").GetBoolean());
    }
}
