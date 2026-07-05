declare const __APP_VERSION__: string;

// queryPermission / requestPermission sont en cours de standardisation ;
// les typings DOM TypeScript ne les incluent pas encore.
interface FileSystemPermissionDescriptor {
  mode?: 'read' | 'readwrite';
}
interface FileSystemHandle {
  queryPermission(descriptor?: FileSystemPermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemPermissionDescriptor): Promise<PermissionState>;
}
