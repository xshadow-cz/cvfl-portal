const SUPABASE_URL = 'https://wtawxcjjcohlpvsuianf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0YXd4Y2pqY29obHB2c3VpYW5mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyNzI3MDksImV4cCI6MjEwNzg0ODcwOX0.1LSCLEK5aM_BHVDu_-Tf015_To_kY2yNEs6jLRAbj3g';

// Inicializace Supabase klienta
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Funkce pro načtení a vykreslení tabulky ligy
async function renderLeagueTable() {
  const tableContainer = document.querySelector('.league-table');
  if (!tableContainer) return;

  // Načtení dat z tabulky 'teams' v Supabase seřazených podle bodů
  const { data: teams, error } = await supabaseClient
    .from('teams')
    .select('*')
    .order('points', { ascending: false });

  if (error) {
    console.error('Chyba při načítání tabulky:', error);
    tableContainer.innerHTML = '<p>Nepodařilo se načíst tabulku ligy.</p>';
    return;
  }

  // Vytvoření HTML struktury tabulky
  let tableHTML = `
    <table>
      <thead>
        <tr>
          <th>Pozice</th>
          <th>Tým</th>
          <th>Zápasy</th>
          <th>Výhry</th>
          <th>Remízy</th>
          <th>Prohry</th>
          <th>Body</th>
        </tr>
      </thead>
      <tbody>
  `;

  teams.forEach((team, index) => {
    tableHTML += `
      <tr>
        <td>${index + 1}.</td>
        <td><strong>${team.name}</strong></td>
        <td>${team.played || 0}</td>
        <td>${team.wins || 0}</td>
        <td>${team.draws || 0}</td>
        <td>${team.losses || 0}</td>
        <td><strong>${team.points || 0}</strong></td>
      </tr>
    `;
  });

  tableHTML += `
      </tbody>
    </table>
  `;

  // Vložení tabulky do webu
  tableContainer.innerHTML = tableHTML;
}

// Spuštění po načtení stránky
document.addEventListener('DOMContentLoaded', renderLeagueTable);