import React from 'react';

interface ModelViewerProps {
  src: string;
  fileName: string;
  fileType: string;
}

const ModelViewer: React.FC<ModelViewerProps> = ({ src, fileName, fileType }) => {
  const isGLB = fileType === 'model/gltf-binary' || fileName.endsWith('.glb') || fileName.endsWith('.gltf');

  if (!isGLB) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center text-muted-foreground">
        <p>3D preview supports GLB/GLTF files</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex items-center justify-center bg-black/5">
      <div className="text-center max-w-md p-8">
        <div className="text-6xl mb-4">🧊</div>
        <h3 className="text-base font-semibold mb-2">{fileName}</h3>
        <p className="text-sm text-muted-foreground mb-4">
          3D model preview requires the model-viewer web component.
        </p>
        <p className="text-xs text-muted-foreground">
          Install it via: <code className="bg-muted px-1 rounded">npm install @google/model-viewer</code>
        </p>
      </div>
    </div>
  );
};

export default ModelViewer;
