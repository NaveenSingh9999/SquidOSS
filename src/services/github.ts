
import { supabase } from '@/integrations/supabase/client';

export interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  language: string;
  visibility: string;
}

export interface GithubUser {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  name: string;
  bio: string;
  public_repos: number;
  followers: number;
  following: number;
}

const DEFAULT_REPO_OWNER = import.meta.env.VITE_REPO_OWNER as string | undefined;
const DEFAULT_REPO_SLUG = import.meta.env.VITE_REPO_SLUG as string | undefined;

export async function getUserRepositories(username: string): Promise<GithubRepo[]> {
  try {
    const { data, error } = await supabase.functions.invoke('github-api', {
      body: {
        endpoint: `users/${username}/repos`,
        params: {
          sort: 'updated',
          per_page: 10
        }
      }
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching GitHub repositories:', error);
    throw error;
  }
}

export async function getRepository(owner?: string, repo?: string): Promise<GithubRepo> {
  const resolvedOwner = owner ?? DEFAULT_REPO_OWNER;
  const resolvedRepo = repo ?? DEFAULT_REPO_SLUG;

  if (!resolvedOwner || !resolvedRepo) {
    throw new Error('Missing GitHub repository configuration. Set VITE_REPO_OWNER and VITE_REPO_SLUG.');
  }

  try {
    const { data, error } = await supabase.functions.invoke('github-api', {
      body: {
        endpoint: `repos/${resolvedOwner}/${resolvedRepo}`
      }
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching GitHub repository:', error);
    throw error;
  }
}

export async function getUser(username: string): Promise<GithubUser> {
  try {
    const { data, error } = await supabase.functions.invoke('github-api', {
      body: {
        endpoint: `users/${username}`
      }
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching GitHub user:', error);
    throw error;
  }
}
