import { supabase } from '@/integrations/supabase/client';
import { getActiveWorkspaceId } from '@/lib/api';

export interface CbCodeIDEPreferences {
  autosaveEnabled: boolean;
  autosaveIntervalMs: number;
  formatOnSave: boolean;
  lintOnSave: boolean;
  trimTrailingWhitespace: boolean;
  insertFinalNewline: boolean;
  wordWrap: 'off' | 'on' | 'wordWrapColumn' | 'bounded';
  wordWrapColumn: number;
  minimapEnabled: boolean;
  lineNumbers: 'off' | 'on' | 'relative' | 'interval';
  tabSize: number;
  insertSpaces: boolean;
  fontSize: number;
  lineHeight: number;
  smoothScrolling: boolean;
  cursorBlinking: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid';
  cursorSmoothCaretAnimation: 'on' | 'off' | 'explicit';
  bracketPairColorization: boolean;
  suggestOnTriggerCharacters: boolean;
  quickSuggestions: boolean;
  acceptSuggestionOnCommitCharacter: boolean;
  inlineSuggestEnabled: boolean;
  stickyScrollEnabled: boolean;
  codeLens: boolean;
  renderWhitespace: 'none' | 'boundary' | 'selection' | 'trailing' | 'all';
  scrollBeyondLastLine: boolean;
  rulers: number[];
  paddingTop: number;
  paddingBottom: number;
}

export interface CbCodeSessionState {
  activeFileId: string | null;
  openTabs: Array<{ id: string; name: string; language: string; fileId?: string }>;
  showTerminal: boolean;
  searchQuery: string;
  layout: {
    sidebarWidth: number;
    terminalHeight: number;
  };
}

export const DEFAULT_CBCODE_PREFERENCES: CbCodeIDEPreferences = {
  autosaveEnabled: true,
  autosaveIntervalMs: 15000,
  formatOnSave: true,
  lintOnSave: false,
  trimTrailingWhitespace: true,
  insertFinalNewline: true,
  wordWrap: 'on',
  wordWrapColumn: 120,
  minimapEnabled: true,
  lineNumbers: 'on',
  tabSize: 2,
  insertSpaces: true,
  fontSize: 14,
  lineHeight: 22,
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: 'on',
  bracketPairColorization: true,
  suggestOnTriggerCharacters: true,
  quickSuggestions: true,
  acceptSuggestionOnCommitCharacter: true,
  inlineSuggestEnabled: true,
  stickyScrollEnabled: true,
  codeLens: false,
  renderWhitespace: 'selection',
  scrollBeyondLastLine: false,
  rulers: [100],
  paddingTop: 10,
  paddingBottom: 10,
};

export const DEFAULT_CBCODE_SESSION_STATE: CbCodeSessionState = {
  activeFileId: null,
  openTabs: [],
  showTerminal: false,
  searchQuery: '',
  layout: {
    sidebarWidth: 300,
    terminalHeight: 220,
  },
};

export const toMonacoOptions = (prefs?: CbCodeIDEPreferences) => {
  if (!prefs) return {};
  return {
    fontSize: prefs.fontSize,
    lineHeight: prefs.lineHeight,
    minimap: { enabled: prefs.minimapEnabled },
    wordWrap: prefs.wordWrap,
    wordWrapColumn: prefs.wordWrapColumn,
    smoothScrolling: prefs.smoothScrolling,
    lineNumbers: prefs.lineNumbers,
    tabSize: prefs.tabSize,
    insertSpaces: prefs.insertSpaces,
    cursorBlinking: prefs.cursorBlinking,
    cursorSmoothCaretAnimation: prefs.cursorSmoothCaretAnimation,
    bracketPairColorization: { enabled: prefs.bracketPairColorization },
    suggestOnTriggerCharacters: prefs.suggestOnTriggerCharacters,
    quickSuggestions: prefs.quickSuggestions,
    acceptSuggestionOnCommitCharacter: prefs.acceptSuggestionOnCommitCharacter,
    inlineSuggest: { enabled: prefs.inlineSuggestEnabled },
    stickyScroll: { enabled: prefs.stickyScrollEnabled },
    codeLens: prefs.codeLens,
    renderWhitespace: prefs.renderWhitespace,
    scrollBeyondLastLine: prefs.scrollBeyondLastLine,
    rulers: prefs.rulers,
    padding: { top: prefs.paddingTop, bottom: prefs.paddingBottom },
  };
};

export async function resolveCbCodeWorkspaceId(userId: string): Promise<string | null> {
  const localWorkspaceId = getActiveWorkspaceId();
  if (localWorkspaceId) {
    return localWorkspaceId;
  }

  const { data, error } = await supabase.rpc('get_or_create_default_workspace', {
    p_user_id: userId,
  });

  if (error) {
    console.error('cbCode workspace resolve failed:', error);
    return null;
  }

  if (typeof data === 'string' && typeof window !== 'undefined') {
    localStorage.setItem('squid_active_workspace_id', data);
  }

  return typeof data === 'string' ? data : null;
}

export async function loadCbCodeBootstrap(userId: string, workspaceId: string | null): Promise<{
  preferences: CbCodeIDEPreferences;
  sessionState: CbCodeSessionState;
}> {
  if (!workspaceId) {
    return {
      preferences: DEFAULT_CBCODE_PREFERENCES,
      sessionState: DEFAULT_CBCODE_SESSION_STATE,
    };
  }

  const [prefsResult, sessionResult] = await Promise.all([
    supabase
      .from('cbcode_preferences')
      .select('options')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    supabase
      .from('cbcode_sessions')
      .select('state')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .eq('session_name', 'default')
      .maybeSingle(),
  ]);

  const preferences = prefsResult?.data?.options
    ? { ...DEFAULT_CBCODE_PREFERENCES, ...(prefsResult.data.options as Partial<CbCodeIDEPreferences>) }
    : DEFAULT_CBCODE_PREFERENCES;

  const sessionState = sessionResult?.data?.state
    ? {
        ...DEFAULT_CBCODE_SESSION_STATE,
        ...(sessionResult.data.state as Partial<CbCodeSessionState>),
      }
    : DEFAULT_CBCODE_SESSION_STATE;

  return { preferences, sessionState };
}

export async function saveCbCodePreferences(
  userId: string,
  workspaceId: string,
  preferences: CbCodeIDEPreferences
): Promise<void> {
  const { error } = await supabase
    .from('cbcode_preferences')
    .upsert(
      {
        user_id: userId,
        workspace_id: workspaceId,
        options: preferences,
      },
      {
        onConflict: 'user_id,workspace_id',
      }
    );

  if (error) {
    console.error('Saving cbCode preferences failed:', error);
  }
}

export async function saveCbCodeSessionState(
  userId: string,
  workspaceId: string,
  sessionState: CbCodeSessionState
): Promise<void> {
  const { error } = await supabase
    .from('cbcode_sessions')
    .upsert(
      {
        user_id: userId,
        workspace_id: workspaceId,
        session_name: 'default',
        state: sessionState,
      },
      {
        onConflict: 'user_id,workspace_id,session_name',
      }
    );

  if (error) {
    console.error('Saving cbCode session failed:', error);
  }
}

export async function saveCbCodeSnapshot(params: {
  userId: string;
  workspaceId: string;
  fileId: string;
  language: string;
  content: string;
  reason: 'manual' | 'autosave' | 'run';
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { userId, workspaceId, fileId, language, content, reason, metadata } = params;

  const { error } = await supabase
    .from('cbcode_file_snapshots')
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      file_id: fileId,
      language,
      content,
      save_reason: reason,
      metadata: metadata || {},
    });

  if (error) {
    console.error('Saving cbCode snapshot failed:', error);
  }
}
