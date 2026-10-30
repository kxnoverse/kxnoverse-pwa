import { useEffect, useState } from "react";
import { Disc3 } from "lucide-react";

export function MusicArtwork({ artwork, alt, className = "" }: {
  artwork?: Blob;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!artwork) {
      setUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(artwork);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [artwork]);

  return (
    <div
      className={`music-artwork${url ? " has-image" : ""}${className ? ` ${className}` : ""}`}
      role={url ? undefined : "img"}
      aria-label={url ? undefined : alt}
    >
      {url ? (
        <img src={url} alt={alt} loading="lazy" />
      ) : (
        <Disc3 size={36} strokeWidth={1.2} aria-hidden="true" />
      )}
    </div>
  );
}
