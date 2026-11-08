/** MUI icon data-testid -> Material Symbols Rounded ligature. Extend from docs/notes/web-12.4-dom.md muiIconTestIds. */
export const MUI_ICON_MAP: Record<string, string> = {
  HomeIcon: 'home', SearchIcon: 'search', MenuIcon: 'menu', SettingsIcon: 'settings', CastIcon: 'cast',
  CastConnectedIcon: 'cast_connected', PlayArrowIcon: 'play_arrow', PauseIcon: 'pause', FavoriteIcon: 'favorite',
  FavoriteBorderIcon: 'favorite', CheckIcon: 'check', CheckCircleIcon: 'check_circle', AddIcon: 'add',
  MoreVertIcon: 'more_vert', MoreHorizIcon: 'more_horiz', CloseIcon: 'close', ArrowBackIcon: 'arrow_back',
  ArrowForwardIcon: 'arrow_forward', ChevronLeftIcon: 'chevron_left', ChevronRightIcon: 'chevron_right',
  ExpandMoreIcon: 'keyboard_arrow_down', ExpandLessIcon: 'keyboard_arrow_up', MovieIcon: 'movie', TvIcon: 'tv', LiveTvIcon: 'live_tv',
  MusicNoteIcon: 'music_note', LibraryMusicIcon: 'library_music', PhotoLibraryIcon: 'photo_library', BookIcon: 'book',
  FolderIcon: 'folder', DashboardIcon: 'dashboard', PersonIcon: 'person', AccountCircleIcon: 'account_circle',
  LogoutIcon: 'logout', NotificationsIcon: 'notifications', InfoIcon: 'info', InfoOutlinedIcon: 'info',
  EditIcon: 'edit', DeleteIcon: 'delete', DownloadIcon: 'download', ShareIcon: 'share', StarIcon: 'star',
  ShuffleIcon: 'shuffle', RepeatIcon: 'repeat', SkipNextIcon: 'skip_next', SkipPreviousIcon: 'skip_previous',
  VolumeUpIcon: 'volume_up', VolumeOffIcon: 'volume_off', SubtitlesIcon: 'subtitles', FullscreenIcon: 'fullscreen',
  FilterListIcon: 'filter_list', SortIcon: 'sort', ViewModuleIcon: 'view_module', ListIcon: 'list',
  SyncIcon: 'sync', RefreshIcon: 'refresh', DevicesIcon: 'devices', GroupIcon: 'group', HelpIcon: 'help',
  GroupsIcon: 'groups', GroupAddIcon: 'group_add', SettingsRemoteIcon: 'settings_remote', PhonelinkLockIcon: 'lock',
  CollectionsBookmarkIcon: 'collections_bookmark', PlaylistPlayIcon: 'playlist_play', QueueMusicIcon: 'queue_music',
};

/** Legacy material-icons ligatures whose Rounded/filled equivalent has a different name. */
export const FONT_ICON_RENAMES: Record<string, string> = {
  favorite_border: 'favorite',
  star_border: 'star',
  bookmark_border: 'bookmark',
  check_box_outline_blank: 'check_box_outline_blank',
};
