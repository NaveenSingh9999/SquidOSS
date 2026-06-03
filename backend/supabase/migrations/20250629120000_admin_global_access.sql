
-- Create admin access policies for global data viewing

-- Drop existing restrictive policies if they exist and create admin-friendly ones

-- Profiles table - admins can see all profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can view own profile or admins can view all" 
  ON public.profiles 
  FOR SELECT 
  USING (auth.uid() = id OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);

CREATE POLICY "Users can update own profile" 
  ON public.profiles 
  FOR UPDATE 
  USING (auth.uid() = id);

-- Files table - admins can see all files
DROP POLICY IF EXISTS "Users can view own files" ON public.files;
DROP POLICY IF EXISTS "Users can insert own files" ON public.files;
DROP POLICY IF EXISTS "Users can update own files" ON public.files;
DROP POLICY IF EXISTS "Users can delete own files" ON public.files;

CREATE POLICY "Users can view own files or admins can view all" 
  ON public.files 
  FOR SELECT 
  USING (auth.uid() = user_id OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);

CREATE POLICY "Users can insert own files" 
  ON public.files 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own files or admins can update all" 
  ON public.files 
  FOR UPDATE 
  USING (auth.uid() = user_id OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);

CREATE POLICY "Users can delete own files or admins can delete all" 
  ON public.files 
  FOR DELETE 
  USING (auth.uid() = user_id OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);

-- API keys table - admins can see all API keys
DROP POLICY IF EXISTS "Users can view their own API keys" ON public.api_keys;
DROP POLICY IF EXISTS "Users can create their own API keys" ON public.api_keys;
DROP POLICY IF EXISTS "Users can update their own API keys" ON public.api_keys;
DROP POLICY IF EXISTS "Users can delete their own API keys" ON public.api_keys;

CREATE POLICY "Users can view own API keys or admins can view all" 
  ON public.api_keys 
  FOR SELECT 
  USING (auth.uid() = user_id OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);

CREATE POLICY "Users can create their own API keys" 
  ON public.api_keys 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own API keys or admins can update all" 
  ON public.api_keys 
  FOR UPDATE 
  USING (auth.uid() = user_id OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);

CREATE POLICY "Users can delete own API keys or admins can delete all" 
  ON public.api_keys 
  FOR DELETE 
  USING (auth.uid() = user_id OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);

-- API request logs - admins can see all logs
DROP POLICY IF EXISTS "Users can view their own API request logs" ON public.api_request_logs;

CREATE POLICY "Users can view own logs or admins can view all" 
  ON public.api_request_logs 
  FOR SELECT 
  USING (auth.uid() = user_id OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);

CREATE POLICY "System can insert API request logs" 
  ON public.api_request_logs 
  FOR INSERT 
  WITH CHECK (true);

-- Admin access logs - admins can see all admin logs
DROP POLICY IF EXISTS "Users can view own admin logs" ON public.admin_access_logs;

CREATE POLICY "Admins can view all admin access logs" 
  ON public.admin_access_logs 
  FOR SELECT 
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);

CREATE POLICY "System can insert admin access logs" 
  ON public.admin_access_logs 
  FOR INSERT 
  WITH CHECK (true);
