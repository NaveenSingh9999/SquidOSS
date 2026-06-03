
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getUserRepositories, getUser, GithubRepo, GithubUser } from '@/services/github';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Github, Star, GitFork, ExternalLink, Search, Loader2, User } from '@/lib/icon-map';

const GitHubRepositories = () => {
  const [username, setUsername] = useState('');
  const [searchedUsername, setSearchedUsername] = useState('');
  const { toast } = useToast();

  const { 
    data: repositories, 
    isLoading: reposLoading, 
    error: reposError,
    refetch: refetchRepos
  } = useQuery({
    queryKey: ['github-repos', searchedUsername],
    queryFn: () => searchedUsername ? getUserRepositories(searchedUsername) : Promise.resolve([]),
    enabled: !!searchedUsername,
  });

  const { 
    data: user, 
    isLoading: userLoading,
    error: userError 
  } = useQuery({
    queryKey: ['github-user', searchedUsername],
    queryFn: () => searchedUsername ? getUser(searchedUsername) : Promise.resolve(null),
    enabled: !!searchedUsername,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      toast({
        title: "Username Required",
        description: "Please enter a GitHub username to search",
        variant: "destructive",
      });
      return;
    }
    setSearchedUsername(username.trim());
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const isLoading = userLoading || reposLoading;
  const hasError = userError || reposError;

  return (
    <div className="space-y-6">
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          placeholder="Enter GitHub username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-2 h-4 w-4" />
          )}
          Search
        </Button>
      </form>

      {hasError && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">
              Error fetching GitHub data. Please check the username and try again.
            </p>
          </CardContent>
        </Card>
      )}

      {user && !hasError && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div className="flex gap-4 items-center">
                <img 
                  src={user.avatar_url} 
                  alt={user.login} 
                  className="rounded-full h-16 w-16 object-cover" 
                />
                <div>
                  <CardTitle>{user.name || user.login}</CardTitle>
                  <CardDescription className="mt-1">@{user.login}</CardDescription>
                </div>
              </div>
              <a 
                href={user.html_url} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-sm text-blue-500 hover:underline flex items-center"
              >
                <Github className="h-4 w-4 mr-1" />
                View Profile
              </a>
            </div>
          </CardHeader>
          <CardContent>
            {user.bio && <p className="text-sm text-muted-foreground mb-2">{user.bio}</p>}
            <div className="flex gap-4 text-sm text-muted-foreground">
              <div className="flex items-center">
                <User className="h-4 w-4 mr-1" />
                {user.followers} followers
              </div>
              <div>·</div>
              <div>Following {user.following}</div>
              <div>·</div>
              <div>{user.public_repos} repositories</div>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && searchedUsername && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
          <p className="text-muted-foreground">Loading GitHub data...</p>
        </div>
      )}

      {repositories && repositories.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Repositories</h3>
          {repositories.map((repo) => (
            <Card key={repo.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center text-base font-medium">
                      <Github className="h-4 w-4 mr-2 text-muted-foreground" />
                      {repo.name}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {repo.full_name}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2 items-center text-sm text-muted-foreground">
                    <div className="flex items-center">
                      <Star className="h-4 w-4 mr-1" />
                      {repo.stargazers_count}
                    </div>
                    <div className="flex items-center">
                      <GitFork className="h-4 w-4 mr-1" />
                      {repo.forks_count}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {repo.description && (
                  <p className="text-sm text-muted-foreground mb-2">{repo.description}</p>
                )}
                <div className="flex gap-2 items-center">
                  {repo.language && (
                    <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/20 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-300">
                      {repo.language}
                    </span>
                  )}
                  <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs font-medium">
                    {repo.visibility}
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    Updated {formatDate(repo.updated_at)}
                  </span>
                </div>
              </CardContent>
              <CardFooter className="pt-1 pb-4">
                <a
                  href={repo.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-500 hover:underline flex items-center"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  View Repository
                </a>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {searchedUsername && repositories && repositories.length === 0 && !isLoading && !hasError && (
        <Card>
          <CardContent className="pt-6 pb-6 text-center">
            <Github className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No repositories found for this user.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default GitHubRepositories;
