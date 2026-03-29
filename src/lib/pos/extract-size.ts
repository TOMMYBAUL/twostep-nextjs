const CLOTHING_REGEX = /(?:^|[\s—–\-\/,()]+|(?:taille|size|t\.)\s*)(XXS|XS|XXL|XXXL|XL|S|M|L)(?:\s*$|[\s—–\-\/,()]+|$)/i;

const SHOE_REGEX = /(?:^|[\s—–\-\/,()]+|(?:taille|size|t\.)\s*)((?:3[5-9]|4[0-8])(?:\.5)?)(?:\s*$|[\s—–\-\/,()]+|$)/;

export function extractSize(name: string): string | null {
    if (!name) return null;

    // Try shoe size first (more specific — avoids matching "S" in words)
    const shoeMatch = name.match(SHOE_REGEX);
    if (shoeMatch?.[1]) {
        return shoeMatch[1];
    }

    // Try clothing size
    const clothingMatch = name.match(CLOTHING_REGEX);
    if (clothingMatch?.[1]) {
        return clothingMatch[1].toUpperCase();
    }

    return null;
}

/**
 * Remove the size portion from a product name to get the "base name".
 * Used to group sibling products that differ only by size.
 */
export function stripSize(name: string): string {
    if (!name) return "";
    const size = extractSize(name);
    if (!size) return name.trim();

    const idx = name.lastIndexOf(size);
    if (idx === -1) return name.trim();

    const before = name.slice(0, idx);
    const after = name.slice(idx + size.length);
    return (before + after).replace(/[\s\-\/,()]+/g, " ").replace(/^\s+|\s+$/g, "").replace(/\s+/g, " ");
}
