const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Suchbegriff: ', (searchTerm) => {
  if (!searchTerm.trim()) {
    console.log('❌ Kein Suchbegriff eingegeben');
    rl.close();
    return;
  }

  console.log(`\n🔍 Suche nach: "${searchTerm}"\n`);
  let foundSomething = false;

  function searchFiles(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory()) {
        searchFiles(fullPath);
      } else if (item.isFile()) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          const foundLines = [];
          
          lines.forEach((line, index) => {
            if (line.includes(searchTerm)) {
              foundLines.push(index + 1);
            }
          });
          
          if (foundLines.length > 0) {
            foundSomething = true;
            console.log(`📄 ${fullPath}`);
            console.log(`   ➤ Zeilen: ${foundLines.join(', ')}`);
          }
        } catch (error) {
          // Überspringt nicht-lesbare Dateien
        }
      }
    }
  }

  searchFiles(process.cwd());
  
  if (!foundSomething) {
    console.log('❌ Keine Ergebnisse gefunden');
  } else {
    console.log('\n✅ Suche abgeschlossen');
  }
  
  rl.close();
});