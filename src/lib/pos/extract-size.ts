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
