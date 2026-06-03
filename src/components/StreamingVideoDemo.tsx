import React from 'react';
import CBVideoPlayer from '@/components/cbVideoPlayer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const StreamingVideoDemo: React.FC = () => {
  // Example file metadata (would come from your file system)
  const demoFile = {
    id: 'demo-video-123',
    name: 'Sample Movie - 4K HDR.mp4',
    type: 'video/mp4',
    size: 2500000000, // 2.5GB
  };

  // Example traditional video source
  const demoVideoSrc = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-4">SquidCloud Streaming Video Player</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Experience our new segment-based streaming system with YouTube-style controls, 
          adaptive quality, and secure Res54 decryption.
        </p>
      </div>

      {/* New Streaming Player */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm">NEW</span>
            Streaming Video Player with Res54 Encryption
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Adaptive HLS streaming with on-demand segment decryption, quality switching, 
            and resume-from-position. Features auto-fade controls and double-tap seek.
          </p>
        </CardHeader>
        <CardContent>
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
            <CBVideoPlayer
              file={demoFile}
              src={demoVideoSrc}
              useStreaming={true} // Enable the new streaming system
              maxQuality="1080p" // Maximum streaming quality
              playbackMode="streaming" // Use streaming mode
              autoPlay={false}
              poster="https://via.placeholder.com/1920x1080/000000/FFFFFF?text=SquidCloud+Streaming+Demo"
              analytics={{
                onPlay: (position) => console.log('Play at:', position),
                onPause: (position) => console.log('Pause at:', position),
                onSeek: (from, to) => console.log('Seek from', from, 'to', to),
                onQualityChange: (quality) => console.log('Quality changed to:', quality),
                onSpeedChange: (speed) => console.log('Speed changed to:', speed),
                onBufferStart: (position) => console.log('Buffer start at:', position),
                onBufferEnd: (position) => console.log('Buffer end at:', position),
                onComplete: () => console.log('Video completed'),
                onError: (error) => console.error('Video error:', error),
              }}
              onDownload={() => console.log('Download requested')}
              onShare={() => console.log('Share requested')}
            />
          </div>
          
          {/* Feature highlights */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded">
              <h4 className="font-semibold text-green-700 dark:text-green-300">🎯 Adaptive Streaming</h4>
              <p className="text-green-600 dark:text-green-400">
                Automatically adjusts quality based on bandwidth
              </p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
              <h4 className="font-semibold text-blue-700 dark:text-blue-300">🔒 Secure Decryption</h4>
              <p className="text-blue-600 dark:text-blue-400">
                On-demand Res54 segment decryption
              </p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded">
              <h4 className="font-semibold text-purple-700 dark:text-purple-300">⚡ YouTube-like UX</h4>
              <p className="text-purple-600 dark:text-purple-400">
                Double-tap seek, auto-fade controls
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Technical Overview */}
      <Card>
        <CardHeader>
          <CardTitle>🔧 Technical Implementation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-3">Backend Components</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <code>/edge/media/manifest</code> - HLS manifest generation
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <code>/edge/media/segment</code> - Segment decrypt proxy
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <code>/edge/media/playlist</code> - Variant playlists
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  HMAC signed URLs with TTL expiry
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Frontend Features</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  HLS.js integration with adaptive streaming
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  Quality switching (240p - 1080p)
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  Resume-from-position support
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  Progressive loading states
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Example */}
      <Card>
        <CardHeader>
          <CardTitle>📝 Usage Example</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg text-sm overflow-x-auto">
{`<CBVideoPlayer
  file={{
    id: 'your-file-id',
    name: 'My Video.mp4',
    type: 'video/mp4',
    size: 2500000000
  }}
  src="fallback-direct-url.mp4"
  useStreaming={true}        // Enable segment streaming
  maxQuality="1080p"         // Max quality for adaptive streaming
  playbackMode="streaming"   // Use streaming vs download mode
  autoPlay={false}
  analytics={analyticsConfig}
  onDownload={handleDownload}
  onShare={handleShare}
/>`}
          </pre>
        </CardContent>
      </Card>

      <div className="text-center">
        <Button 
          onClick={() => window.location.reload()}
          variant="outline"
        >
          🔄 Refresh Demo
        </Button>
      </div>
    </div>
  );
};

export default StreamingVideoDemo;