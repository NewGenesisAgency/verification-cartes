/**
 * Génère un rapport PDF des passages (KPIs + top classes + tableau) avec jsPDF.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PassageEntry {
    nom: string;
    prenom: string;
    classe: string;
    date: string;
    heure: string;
    annee: string;
    eligible: string;
    statut: string;
    borne: string;
}

interface Analytics {
    total: number;
    refused: number;
    accepted: number;
    refusalRate: number;
    topClasses: [string, number][];
}

export function exportPassagesPdf(opts: {
    passages: PassageEntry[];
    analytics: Analytics;
    dateLabel: string;
    borneLabel: string;
}) {
    const { passages, analytics, dateLabel, borneLabel } = opts;
    const doc = new jsPDF();
    const now = new Date().toLocaleString('fr-FR');

    doc.setFontSize(18);
    doc.text('Rapport des passages — MDL', 14, 18);

    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Lycée Edouard Branly · généré le ${now}`, 14, 25);
    doc.text(`Période : ${dateLabel}   |   Borne : ${borneLabel}`, 14, 31);

    // KPIs
    doc.setTextColor(0);
    doc.setFontSize(12);
    doc.text(
        `Total : ${analytics.total}    Acceptés : ${analytics.accepted}    Refusés : ${analytics.refused}    Taux de refus : ${analytics.refusalRate}%`,
        14, 41,
    );

    // Top classes
    let y = 51;
    doc.setFontSize(11);
    doc.text('Top classes :', 14, y);
    y += 6;
    doc.setFontSize(10);
    if (analytics.topClasses.length === 0) {
        doc.text('—', 18, y);
        y += 5;
    } else {
        analytics.topClasses.forEach(([classe, count]) => {
            doc.text(`• ${classe} : ${count}`, 18, y);
            y += 5;
        });
    }

    // Tableau détaillé
    autoTable(doc, {
        startY: y + 4,
        head: [['Nom', 'Prénom', 'Classe', 'Borne', 'Statut', 'Date', 'Heure']],
        body: passages.map(p => [p.nom, p.prenom, p.classe, p.borne, p.statut, p.date, p.heure]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 30, 30] },
    });

    doc.save(`rapport-passages-${new Date().toISOString().split('T')[0]}.pdf`);
}
