import { jsPDF } from 'jspdf'

const GREEN = [22, 163, 74] as [number, number, number]

export function exportTablePDF(options: {
  title: string
  filterSummary: string
  headers: string[]
  rows: string[][]
  filename: string
}) {
  const { title, filterSummary, headers, rows, filename } = options
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = 210
  const margin = 14
  let y = 18

  doc.setFontSize(18)
  doc.setTextColor(...GREEN)
  doc.text('Project Pelican', margin, y)
  y += 8

  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, margin, y)
  y += 6

  doc.setFontSize(14)
  doc.setTextColor(0, 0, 0)
  doc.text(title, margin, y)
  y += 6

  doc.setFontSize(9)
  doc.setTextColor(80, 80, 80)
  doc.text(`Filters: ${filterSummary}`, margin, y)
  y += 10

  const colCount = headers.length
  const colW = (pageW - margin * 2) / colCount
  const rowH = 7
  const fontSize = 8

  doc.setFontSize(fontSize)
  doc.setFillColor(...GREEN, 0.2)
  doc.rect(margin, y, pageW - margin * 2, rowH, 'F')
  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'bold')
  headers.forEach((h, i) => {
    doc.text((h ?? '').slice(0, 18), margin + i * colW + 2, y + 5)
  })
  doc.setFont('helvetica', 'normal')
  y += rowH

  rows.forEach((row) => {
    if (y > 270) {
      doc.addPage()
      y = 20
    }
    row.forEach((cell, i) => {
      doc.text(String(cell ?? '').slice(0, 22), margin + i * colW + 2, y + 5)
    })
    y += rowH
  })

  doc.save(filename)
}
