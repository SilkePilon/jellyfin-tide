#!/usr/bin/env sh
# Small open-licence films (Blender Foundation, CC-BY) for local testing.
set -e
cd "$(dirname "$0")"
mkdir -p "media/Movies/Big Buck Bunny (2008)" "media/Movies/Sintel (2010)" "media/Shows/Blender Shorts/Season 01"
dl() { [ -f "$2" ] || curl -L --fail -o "$2" "$1"; }
# Big Buck Bunny 320x180 is only published zipped now; fetch once, extract the single .mp4 to stdout.
BBB_ZIP=media/.BigBuckBunny_320x180.mp4.zip
bbb() { [ -f "$1" ] && return; dl https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4.zip "$BBB_ZIP"; unzip -p "$BBB_ZIP" '*.mp4' > "$1"; }
bbb "media/Movies/Big Buck Bunny (2008)/Big Buck Bunny (2008).mp4"
dl https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4 "media/Movies/Sintel (2010)/Sintel (2010).mp4"
dl https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4 "media/Shows/Blender Shorts/Season 01/Blender Shorts S01E01.mp4"
bbb "media/Shows/Blender Shorts/Season 01/Blender Shorts S01E02.mp4"
mkdir -p "media/Shows/Blender Shorts/Season 02"
[ -e "media/Shows/Blender Shorts/Season 02/Blender Shorts S02E01.mp4" ] || ln "media/Movies/Sintel (2010)/Sintel (2010).mp4" "media/Shows/Blender Shorts/Season 02/Blender Shorts S02E01.mp4" 2>/dev/null || cp "media/Movies/Sintel (2010)/Sintel (2010).mp4" "media/Shows/Blender Shorts/Season 02/Blender Shorts S02E01.mp4"
# More titles (copies of the Sintel trailer under real open-movie names) so Jellyfin fetches their artwork and
# Discover / New this week have enough items to render.
for t in "Elephants Dream (2006)" "Tears of Steel (2012)" "Spring (2019)" "Cosmos Laundromat (2015)" "Agent 327 Operation Barbershop (2017)" "Caminandes Llama Drama (2013)"; do
  mkdir -p "media/Movies/$t"
  [ -e "media/Movies/$t/$t.mp4" ] || ln "media/Movies/Sintel (2010)/Sintel (2010).mp4" "media/Movies/$t/$t.mp4" 2>/dev/null || cp "media/Movies/Sintel (2010)/Sintel (2010).mp4" "media/Movies/$t/$t.mp4"
done
