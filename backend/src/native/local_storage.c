#include <node_api.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>

#define MAX_PATH 4096
#define CHUNK_SIZE 65536

// Helper: extract string from napi_value
static napi_status get_string(napi_env env, napi_value val, char *buf, size_t len) {
  size_t str_len;
  napi_status status = napi_get_value_string_utf8(env, val, buf, len, &str_len);
  return status;
}

// Helper: create error
static napi_value throw_error(napi_env env, const char *msg) {
  napi_throw_error(env, NULL, msg);
  return NULL;
}

// Helper: create string return
static napi_value string_result(napi_env env, const char *str) {
  napi_value result;
  napi_create_string_utf8(env, str, NAPI_AUTO_LENGTH, &result);
  return result;
}

// Helper: create int32 return
static napi_value int32_result(napi_env env, int32_t val) {
  napi_value result;
  napi_create_int32(env, val, &result);
  return result;
}

// Helper: create boolean return
static napi_value bool_result(napi_env env, bool val) {
  napi_value result;
  napi_get_boolean(env, val, &result);
  return result;
}

// write_file(path, buffer) -> void
static napi_value write_file(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);

  char path[MAX_PATH];
  if (get_string(env, args[0], path, sizeof(path)) != napi_ok)
    return throw_error(env, "path required");

  void *data;
  size_t data_len;
  if (napi_get_buffer_info(env, args[1], &data, &data_len) != napi_ok)
    return throw_error(env, "buffer required");

  FILE *f = fopen(path, "wb");
  if (!f) {
    char err[256];
    snprintf(err, sizeof(err), "open failed: %s", strerror(errno));
    return throw_error(env, err);
  }

  size_t written = fwrite(data, 1, data_len, f);
  fclose(f);

  if (written != data_len)
    return throw_error(env, "write failed");

  return NULL;
}

// read_file(path) -> buffer
static napi_value read_file(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);

  char path[MAX_PATH];
  if (get_string(env, args[0], path, sizeof(path)) != napi_ok)
    return throw_error(env, "path required");

  FILE *f = fopen(path, "rb");
  if (!f) {
    char err[256];
    snprintf(err, sizeof(err), "open failed: %s", strerror(errno));
    return throw_error(env, err);
  }

  fseek(f, 0, SEEK_END);
  long file_size = ftell(f);
  rewind(f);

  if (file_size < 0) {
    fclose(f);
    return throw_error(env, "stat failed");
  }

  napi_value buffer;
  void *buf_data;
  napi_create_buffer(env, (size_t)file_size, &buf_data, &buffer);

  size_t read = fread(buf_data, 1, (size_t)file_size, f);
  fclose(f);

  if ((long)read != file_size)
    return throw_error(env, "read failed");

  return buffer;
}

// stat(path) -> { size, mode, is_file, is_dir }
static napi_value stat_file(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);

  char path[MAX_PATH];
  if (get_string(env, args[0], path, sizeof(path)) != napi_ok)
    return throw_error(env, "path required");

  struct stat st;
  if (stat(path, &st) != 0) {
    char err[256];
    snprintf(err, sizeof(err), "stat failed: %s", strerror(errno));
    return throw_error(env, err);
  }

  napi_value result;
  napi_create_object(env, &result);

  napi_value size_val;
  napi_create_int64(env, (int64_t)st.st_size, &size_val);
  napi_set_named_property(env, result, "size", size_val);

  napi_value mode_val;
  napi_create_int32(env, st.st_mode, &mode_val);
  napi_set_named_property(env, result, "mode", mode_val);

  napi_value is_file;
  napi_get_boolean(env, S_ISREG(st.st_mode), &is_file);
  napi_set_named_property(env, result, "isFile", is_file);

  napi_value is_dir;
  napi_get_boolean(env, S_ISDIR(st.st_mode), &is_dir);
  napi_set_named_property(env, result, "isDirectory", is_dir);

  napi_value mtime;
  napi_create_int64(env, (int64_t)st.st_mtime, &mtime);
  napi_set_named_property(env, result, "mtime", mtime);

  return result;
}

// unlink(path) -> bool
static napi_value unlink_file(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);

  char path[MAX_PATH];
  if (get_string(env, args[0], path, sizeof(path)) != napi_ok)
    return throw_error(env, "path required");

  int ret = unlink(path);
  return bool_result(env, ret == 0);
}

// mkdir(path) -> bool
static napi_value mkdir_path(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);

  char path[MAX_PATH];
  if (get_string(env, args[0], path, sizeof(path)) != napi_ok)
    return throw_error(env, "path required");

  int ret = mkdir(path, 0755);
  return bool_result(env, ret == 0 || errno == EEXIST);
}

// readdir(path) -> string[]
static napi_value readdir_path(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);

  char path[MAX_PATH];
  if (get_string(env, args[0], path, sizeof(path)) != napi_ok)
    return throw_error(env, "path required");

  DIR *dir = opendir(path);
  if (!dir) {
    char err[256];
    snprintf(err, sizeof(err), "opendir failed: %s", strerror(errno));
    return throw_error(env, err);
  }

  napi_value result;
  napi_create_array(env, &result);

  struct dirent *entry;
  uint32_t idx = 0;
  while ((entry = readdir(dir)) != NULL) {
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0)
      continue;
    napi_value name;
    napi_create_string_utf8(env, entry->d_name, NAPI_AUTO_LENGTH, &name);
    napi_set_element(env, result, idx++, name);
  }

  closedir(dir);
  return result;
}

// copy_file(src, dest) -> bool
static napi_value copy_file_path(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);

  char src[MAX_PATH], dest[MAX_PATH];
  if (get_string(env, args[0], src, sizeof(src)) != napi_ok)
    return throw_error(env, "src path required");
  if (get_string(env, args[1], dest, sizeof(dest)) != napi_ok)
    return throw_error(env, "dest path required");

  int fd_in = open(src, O_RDONLY);
  if (fd_in < 0) return bool_result(env, false);

  int fd_out = open(dest, O_WRONLY | O_CREAT | O_TRUNC, 0644);
  if (fd_out < 0) { close(fd_in); return bool_result(env, false); }

  char buf[CHUNK_SIZE];
  ssize_t n;
  while ((n = read(fd_in, buf, sizeof(buf))) > 0) {
    write(fd_out, buf, (size_t)n);
  }

  close(fd_in);
  close(fd_out);
  return bool_result(env, true);
}

// rename(old_path, new_path) -> bool
static napi_value rename_path(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);

  char old_path[MAX_PATH], new_path[MAX_PATH];
  if (get_string(env, args[0], old_path, sizeof(old_path)) != napi_ok)
    return throw_error(env, "old path required");
  if (get_string(env, args[1], new_path, sizeof(new_path)) != napi_ok)
    return throw_error(env, "new path required");

  int ret = rename(old_path, new_path);
  return bool_result(env, ret == 0);
}

// exists(path) -> bool
static napi_value exists_path(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);

  char path[MAX_PATH];
  if (get_string(env, args[0], path, sizeof(path)) != napi_ok)
    return throw_error(env, "path required");

  struct stat st;
  return bool_result(env, stat(path, &st) == 0);
}

// truncate(path, size) -> bool
static napi_value truncate_path(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);

  char path[MAX_PATH];
  if (get_string(env, args[0], path, sizeof(path)) != napi_ok)
    return throw_error(env, "path required");

  int64_t size;
  if (napi_get_value_int64(env, args[1], &size) != napi_ok)
    return throw_error(env, "size required");

  int ret = truncate(path, (off_t)size);
  return bool_result(env, ret == 0);
}

// Module initialization
static napi_value init(napi_env env, napi_value exports) {
  napi_value fn;

  napi_create_function(env, NULL, 0, write_file, NULL, &fn);
  napi_set_named_property(env, exports, "writeFile", fn);

  napi_create_function(env, NULL, 0, read_file, NULL, &fn);
  napi_set_named_property(env, exports, "readFile", fn);

  napi_create_function(env, NULL, 0, stat_file, NULL, &fn);
  napi_set_named_property(env, exports, "stat", fn);

  napi_create_function(env, NULL, 0, unlink_file, NULL, &fn);
  napi_set_named_property(env, exports, "unlink", fn);

  napi_create_function(env, NULL, 0, mkdir_path, NULL, &fn);
  napi_set_named_property(env, exports, "mkdir", fn);

  napi_create_function(env, NULL, 0, readdir_path, NULL, &fn);
  napi_set_named_property(env, exports, "readdir", fn);

  napi_create_function(env, NULL, 0, copy_file_path, NULL, &fn);
  napi_set_named_property(env, exports, "copyFile", fn);

  napi_create_function(env, NULL, 0, rename_path, NULL, &fn);
  napi_set_named_property(env, exports, "rename", fn);

  napi_create_function(env, NULL, 0, exists_path, NULL, &fn);
  napi_set_named_property(env, exports, "exists", fn);

  napi_create_function(env, NULL, 0, truncate_path, NULL, &fn);
  napi_set_named_property(env, exports, "truncate", fn);

  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
