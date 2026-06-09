// Script pour convertir les chemins absolus en chemins relatifs dans les fichiers HTML
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'out');

function getRelativePath(from, depth) {
    // Calculer le chemin relatif vers la racine
    if (depth === 0) return './';
    return '../'.repeat(depth);
}

function fixAllPaths(dir, depth = 0) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            fixAllPaths(filePath, depth + 1);
        } else if (file.endsWith('.html') || file.endsWith('.css') || file.endsWith('.js')) {
            let content = fs.readFileSync(filePath, 'utf-8');
            const relPath = getRelativePath(filePath, depth);
            
            if (file.endsWith('.html')) {
                // IMPORTANT : Traiter les chemins spécifiques AVANT les génériques
                
                // 1. Remplacer TOUS les patterns /_next/ (le plus spécifique d'abord)
                content = content.replace(/href="\/_next\//g, `href="${relPath}_next/`);
                content = content.replace(/src="\/_next\//g, `src="${relPath}_next/`);
                content = content.replace(/content="\/_next\//g, `content="${relPath}_next/`);
                content = content.replace(/srcSet="\/_next\//g, `srcSet="${relPath}_next/`);
                content = content.replace(/srcset="\/_next\//g, `srcset="${relPath}_next/`);
                // Dans les scripts et JSON
                content = content.replace(/"\/\_next\//g, `"${relPath}_next/`);
                content = content.replace(/'\/\_next\//g, `'${relPath}_next/`);
                
                // 2. Remplacer TOUS les patterns /data/
                content = content.replace(/href="\/data\//g, `href="${relPath}data/`);
                content = content.replace(/src="\/data\//g, `src="${relPath}data/`);
                content = content.replace(/content="\/data\//g, `content="${relPath}data/`);
                content = content.replace(/"\/data\//g, `"${relPath}data/`);
                content = content.replace(/'\/data\//g, `'${relPath}data/`);
                
                // 3. Remplacer les chemins /imgs/
                content = content.replace(/href="\/imgs\//g, `href="${relPath}imgs/`);
                content = content.replace(/src="\/imgs\//g, `src="${relPath}imgs/`);
                content = content.replace(/content="\/imgs\//g, `content="${relPath}imgs/`);
                
                // 4. Remplacer les liens de navigation internes (pages)
                // href="/verification-cartes" → href="./verification-cartes" ou href="../verification-cartes"
                content = content.replace(/href="\/([a-zA-Z0-9_-]+)"/g, (match, page) => {
                    // Éviter de toucher aux chemins déjà traités
                    if (page === '_next' || page === 'data' || page === 'imgs') {
                        return match;
                    }
                    return `href="${relPath}${page}"`;
                });
                
                // 5. Remplacer href="/" (page d'accueil)
                content = content.replace(/href="\/"([^\/])/g, `href="${relPath}"$1`);
                content = content.replace(/href="\/">/g, `href="${relPath}">`);
                content = content.replace(/href="\/"$/g, `href="${relPath}"`);
                content = content.replace(/href=" \/"/g, `href="${relPath}"`);
                
                // 6. Patterns génériques restants
                content = content.replace(/src="\/([^"\/][^"]*)"/g, (match, path) => {
                    if (path.startsWith('http') || path.startsWith('//') || path.includes('_next') || path.includes('data')) {
                        return match;
                    }
                    return `src="${relPath}${path}"`;
                });
                
                // 7. Corriger data-href et autres attributs
                content = content.replace(/data-href="\/([^"]*)"/g, `data-href="${relPath}$1"`);
                
                console.log(`✓ HTML: ${file} (profondeur: ${depth}, relPath: ${relPath})`);
            } else if (file.endsWith('.css')) {
                // Corriger les chemins dans les CSS (fonts, images, etc.)
                content = content.replace(/url\(\/_next\//g, `url(${relPath}_next/`);
                content = content.replace(/url\("\/_next\//g, `url("${relPath}_next/`);
                content = content.replace(/url\('\/_next\//g, `url('${relPath}_next/`);
                
                content = content.replace(/url\(\/data\//g, `url(${relPath}data/`);
                content = content.replace(/url\("\/data\//g, `url("${relPath}data/`);
                content = content.replace(/url\('\/data\//g, `url('${relPath}data/`);
                
                console.log(`✓ CSS: ${file}`);
            } else if (file.endsWith('.js')) {
                // Corriger TOUS les chemins dans les JS
                
                // 1. Chemins _next/ (très important pour Next.js)
                content = content.replace(/"\/\_next\//g, `"${relPath}_next/`);
                content = content.replace(/'\/\_next\//g, `'${relPath}_next/`);
                content = content.replace(/`\/\_next\//g, `\`${relPath}_next/`);
                
                // 2. Chemins /data/
                content = content.replace(/"\/data\//g, `"${relPath}data/`);
                content = content.replace(/'\/data\//g, `'${relPath}data/`);
                content = content.replace(/`\/data\//g, `\`${relPath}data/`);
                
                // 3. Chemins /imgs/
                content = content.replace(/"\/imgs\//g, `"${relPath}imgs/`);
                content = content.replace(/'\/imgs\//g, `'${relPath}imgs/`);
                
                // 4. Routes de navigation Next.js
                // Patterns comme {pathname:"/verification-cartes"}
                content = content.replace(/pathname:"\/([a-zA-Z0-9_-]+)"/g, (match, page) => {
                    if (page === '_next' || page === 'data' || page === 'imgs') {
                        return match;
                    }
                    return `pathname:"${relPath}${page}"`;
                });
                
                // 5. Patterns comme href:"/verification-cartes"
                content = content.replace(/href:"\/([a-zA-Z0-9_-]+)"/g, (match, page) => {
                    if (page === '_next' || page === 'data' || page === 'imgs') {
                        return match;
                    }
                    return `href:"${relPath}${page}"`;
                });
                
                // 6. URL de base Next.js (si présent)
                content = content.replace(/assetPrefix:"\//g, `assetPrefix:"${relPath}`);
                content = content.replace(/basePath:"\//g, `basePath:"${relPath}`);
                
                console.log(`✓ JS: ${file}`);
            }
            
            fs.writeFileSync(filePath, content, 'utf-8');
        }
    });
}

console.log('========================================');
console.log('  Correction des chemins relatifs');
console.log('========================================');
console.log('');
fixAllPaths(outDir);
console.log('');
console.log('✓ Terminé ! Tous les chemins sont maintenant relatifs.');
console.log('✓ Vous pouvez ouvrir out/index.html directement.');
