namespace Jellyfin.Plugin.Tide.Hero;

public enum HeroReason
{
    Resume,
    NextEpisode,
    NewEpisode,
    New,
    TopRated,
}

public sealed record HeroCandidate(string Key, Guid ItemId, HeroReason Reason, bool HasBackdrop, bool HasLogo);

public static class HeroSelector
{
    public static IReadOnlyList<HeroCandidate> Select(
        IReadOnlyList<HeroCandidate> personal,
        IReadOnlyList<HeroCandidate> newest,
        IReadOnlyList<HeroCandidate> topRated,
        int size)
    {
        if (size <= 0)
        {
            return Array.Empty<HeroCandidate>();
        }

        var pools = new[]
        {
            new Queue<HeroCandidate>(personal.Where(c => c.HasBackdrop)),
            new Queue<HeroCandidate>(newest.Where(c => c.HasBackdrop)),
            new Queue<HeroCandidate>(topRated.Where(c => c.HasBackdrop).OrderByDescending(c => c.HasLogo)),
        };
        var quota = size / 3;
        var quotas = new[] { quota + (size % 3), quota, quota };
        var used = new HashSet<string>();
        var picked = new List<HeroCandidate>[] { new(), new(), new() };

        bool TakeFrom(int pool)
        {
            while (pools[pool].Count > 0)
            {
                var c = pools[pool].Dequeue();
                if (used.Add(c.Key))
                {
                    picked[pool].Add(c);
                    return true;
                }
            }

            return false;
        }

        for (var p = 0; p < 3; p++)
        {
            for (var i = 0; i < quotas[p]; i++)
            {
                if (!TakeFrom(p))
                {
                    break;
                }
            }
        }

        var total = picked.Sum(l => l.Count);
        for (var p = 0; p < 3 && total < size; p++)
        {
            while (total < size && TakeFrom(p))
            {
                total++;
            }
        }

        var result = new List<HeroCandidate>(size);
        for (var round = 0; result.Count < total; round++)
        {
            for (var p = 0; p < 3; p++)
            {
                if (round < picked[p].Count)
                {
                    result.Add(picked[p][round]);
                }
            }
        }

        return result;
    }

    public static string ReasonString(HeroReason reason) => reason switch
    {
        HeroReason.Resume => "resume",
        HeroReason.NextEpisode => "nextEpisode",
        HeroReason.NewEpisode => "newEpisode",
        HeroReason.New => "new",
        _ => "topRated",
    };
}
