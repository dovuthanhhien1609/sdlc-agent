import React, { useEffect, useRef } from 'react';

interface Props {
  content: string;
}

export function StreamingText({ content }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [content]);

  return (
    <div className="streaming-output" ref={ref}>
      {content || <span style={{ opacity: 0.5 }}>Generating...</span>}
      {content && <span style={{ animation: 'blink 1s step-end infinite' }}>▋</span>}
    </div>
  );
}
