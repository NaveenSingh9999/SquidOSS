{
  "targets": [
    {
      "target_name": "local_storage",
      "sources": ["src/native/local_storage.c"],
      "include_dirs": ["<!(node -e \"require('node:path').resolve(process.execPath, '..', 'include', 'node')\")"]
    }
  ]
}
