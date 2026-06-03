import React, { useMemo } from 'react';

interface FontPreviewerProps {
  src: string;
  fileName: string;
}

const SAMPLE_TEXT = `ABCDEFGHIJKLMNOPQRSTUVWXYZ
abcdefghijklmnopqrstuvwxyz
0123456789 !@#$%^&*()
The quick brown fox jumps over the lazy dog.
Pack my box with five dozen liquor jugs.`;

const FontPreviewer: React.FC<FontPreviewerProps> = ({ src, fileName }) => {
  const fontFamily = useMemo(() => `preview-font-${fileName.replace(/[^a-zA-Z0-9]/g, '-')}`, [fileName]);

  const styleId = useMemo(() => `font-preview-style-${fontFamily}`, [fontFamily]);

  return (
    <div className="flex h-full min-h-[320px] flex-col p-6">
      <style id={styleId}>
        {`@font-face {
          font-family: '${fontFamily}';
          src: url('${src}') format('truetype');
          font-display: swap;
        }`}
      </style>

      <div className="mb-4">
        <h3 className="text-sm font-semibold">{fileName}</h3>
        <p className="text-xs text-muted-foreground">Preview of this font face</p>
      </div>

      <div className="flex-1 rounded-xl border border-border/50 bg-card/50 p-6 overflow-auto">
        <div className="space-y-6">
          {/* Size spectrum */}
          {[48, 32, 24, 18, 14, 11].map((size) => (
            <div key={size}>
              <p
                style={{
                  fontFamily: `'${fontFamily}', serif`,
                  fontSize: `${size}px`,
                  lineHeight: 1.3,
                }}
              >
                {size}px — {SAMPLE_TEXT.slice(0, 60)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Character grid */}
      <div className="mt-4">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Character Set</h4>
        <div className="rounded-xl border border-border/50 bg-card/50 p-4">
          <p
            style={{ fontFamily: `'${fontFamily}', serif`, fontSize: '24px', lineHeight: 1.6 }}
            className="break-all"
          >
            {'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?/~`'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default FontPreviewer;
