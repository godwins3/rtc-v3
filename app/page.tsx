"use client";
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Download, Copy, Save, Clock, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const ReportTimelineCalculator = () => {
  // Project metadata
  const [projectName, setProjectName] = useState('');
  const [clientName, setClientName] = useState('');
  const [reportType, setReportType] = useState('Annual Report');
  const [timestamp, setTimestamp] = useState('');
  const [schedulingMode, setSchedulingMode] = useState('backward'); // backward default
  const [finalDate, setFinalDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [includeWeekends, setIncludeWeekends] = useState(false); // default exclude weekends
  const [holidays, setHolidays] = useState('');
  const [statutory, setStatutory] = useState(0);
  const [globalContingency, setGlobalContingency] = useState(0);
  const [excludeDays, setExcludeDays] = useState(false);
  const [excludeStartDate, setExcludeStartDate] = useState('');
  const [excludeEndDate, setExcludeEndDate] = useState('');
  const [excludeDescription, setExcludeDescription] = useState('');

  // UI expand state
  const [expandedSections, setExpandedSections] = useState({
    editorial: true,
    creative: true,
    design: true,
    web: false,
    print: true
  });

  // Editorial
  const [editorial, setEditorial] = useState({
    dataCollection: 5,
    writing: 10,
    subEditing: 3,
    internalProofreading: 2,
    clientReview1: 3,
    clientReview2: 3,
    clientReview3: 3,
    finalReview: 2,
    contingency: 0,
    skipReview1: false,
    skipReview2: false,
    skipReview3: false
  });

  // Creative
  const [creative, setCreative] = useState({
    themeAvailable: false,
    themeDays: 3,
    themeRev1: 3,
    themeRev2: 3,
    designDuration: 5,
    skipRev1: false,
    skipRev2: false,
    finalSubmissionAuto: true
  });

  // Publication design & layout
  const [design, setDesign] = useState({
    pages: 40,
    layoutType: 'text-based', // 'text-based' or 'heavy-infographics'
    numberOfDesigners: 1,
    editorialProofreading: 2,
    review1: 4,
    review2: 4,
    review3: 4,
    contingency: 2,
    approval: 2,
    skipReview1: false,
    skipReview2: false,
    skipReview3: false
  });

  // Optional web deliverables
  const [webDeliverablesRequired, setWebDeliverablesRequired] = useState(false);
  const [webDeliverables, setWebDeliverables] = useState({
    uiuxDays: 10,
    deploymentDays: 2
  });

  // Print
  const [print, setPrint] = useState({
    preparation: 1,
    printDeliveryDays: 1
  });

  // Result states
  interface Phase {
    name: string;
    start: Date | null;
    end: Date | null;
    days: number;
    reviews?: Array<{ name: string; date: Date | null }>;
    milestones?: Array<{ name: string; date: Date | null }>;
    theme?: string;
  }

  const [timeline, setTimeline] = useState<{
    phases: Phase[];
    totalDays: number;
    totalInternalDays: number;
  } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [savedTimelineId, setSavedTimelineId] = useState<string | null>(null);

  // Load saved timeline from URL parameter
  useEffect(() => {
    const loadTimeline = async () => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('id');

      if (id) {
        try {
          const response = await fetch(`/api/timeline?id=${id}`);
          const result = await response.json();

          if (result.success && result.data) {
            const data = result.data;

            // Load all the state from the saved data
            setProjectName(data.projectName);
            setReportType(data.clientName);
            setSchedulingMode(data.schedulingMethod);
            setStartDate(data.startDate ? new Date(data.startDate).toISOString().split('T')[0] : '');
            setFinalDate(data.endDate ? new Date(data.endDate).toISOString().split('T')[0] : '');
            setHolidays(data.numberOfHolidays ? '' : ''); // holidays are stored as count in DB
            setIncludeWeekends(data.useExtendedWeekends);
            setStatutory(data.finalDeliveryDays);
            setGlobalContingency(data.globalContingency || 0);
            setExcludeDays(data.excludeDays || false);
            setExcludeStartDate(data.excludeStartDate || '');
            setExcludeEndDate(data.excludeEndDate || '');
            setExcludeDescription(data.excludeDescription || '');

            setEditorial(data.editorial);
            setCreative(data.creative);
            setDesign(data.design);
            setWebDeliverablesRequired(data.webDevelopment.enabled);
            setWebDeliverables({
              uiuxDays: data.webDevelopment.frontendDevelopment,
              deploymentDays: data.webDevelopment.testing
            });
            setPrint({
              preparation: data.printProduction.prePressProofing,
              printDeliveryDays: data.printProduction.printing
            });

            // Set the saved timeline ID and trigger calculation
            setSavedTimelineId(id);
          } else {
            alert('Timeline not found or invalid ID.');
          }
        } catch (error) {
          console.error('Error loading timeline:', error);
          alert('Failed to load timeline.');
        }
      }
    };

    loadTimeline();
  }, []);

  // Helper: parse holiday list
  const parseHolidayList = () => {
    return holidays.split(',')
      .map(h => h.trim())
      .filter(h => h)
      .map(h => h); // expect YYYY-MM-DD strings
  };

  // Add or subtract working days
  interface IAddWorkingDays {
    (date: Date | string | null | undefined, days: number, forward?: boolean): Date | null;
  }
  type ISODateString = string;
  type HolidayList = ISODateString[];

  const addWorkingDays: IAddWorkingDays = (date, days, forward = true) => {
    if (!date) return null;
    if (days === 0) return new Date(date as Date | string);
    const result = new Date(date as Date | string);
    const holidayList: HolidayList = parseHolidayList();
    let remaining: number = Math.abs(days);
    const direction: number = forward ? 1 : -1;

    // Get excluded date range
    const excludeStart = excludeDays && excludeStartDate ? new Date(excludeStartDate) : null;
    const excludeEnd = excludeDays && excludeEndDate ? new Date(excludeEndDate) : null;

    while (remaining > 0) {
      result.setDate(result.getDate() + direction);
      const day = result.getDay();
      const isWeekend = !includeWeekends && (day === 0 || day === 6);
      const iso: ISODateString = result.toISOString().split('T')[0];
      const isHoliday = holidayList.includes(iso);

      // Check if date is in excluded range
      const isExcluded = excludeStart && excludeEnd && result >= excludeStart && result <= excludeEnd;

      if (!isWeekend && !isHoliday && !isExcluded) remaining--;
    }
    return result;
  };

  // Utility: simple date difference in calendar days inclusive
  const diffDaysInclusive = (start, end) => {
    if (!start || !end) return 0;
    const ms = 24 * 60 * 60 * 1000;
    return Math.round((end - start) / ms) + 1;
  };

  // Calculate excluded working days
  const calculateExcludedWorkingDays = () => {
    if (!excludeDays || !excludeStartDate || !excludeEndDate) return 0;

    const start = new Date(excludeStartDate);
    const end = new Date(excludeEndDate);

    if (end < start) return 0;

    let excludedDays = 0;
    const current = new Date(start);
    const holidayList = parseHolidayList();

    while (current <= end) {
      const day = current.getDay();
      const isWeekend = !includeWeekends && (day === 0 || day === 6);
      const iso = current.toISOString().split('T')[0];
      const isHoliday = holidayList.includes(iso);

      if (!isWeekend && !isHoliday) {
        excludedDays++;
      }

      current.setDate(current.getDate() + 1);
    }

    return excludedDays;
  };

  // Validation helper
  const validateInputs = () => {
    const errs = [];
    if (!projectName) errs.push('Project title is required');
    if (!reportType) errs.push('Select report type');
    if (schedulingMode === 'backward' && !finalDate) errs.push('Final delivery date is required');
    if (schedulingMode === 'forward' && !startDate) errs.push('Project start date is required');
    if (design.pages < 1) errs.push('Number of pages must be at least 1');
    // numeric limits
    const numericFields = [
      { val: editorial.dataCollection, name: 'Data collection days' },
      { val: editorial.writing, name: 'Writing days' },
      { val: design.pages, name: 'Pages' },
      { val: creative.designDuration, name: 'Creative design duration' }
    ];
    numericFields.forEach(f => {
      if (f.val < 0) errs.push(`${f.name} must be zero or positive`);
      if (f.val > 365) errs.push(`${f.name} is too large`);
    });
    return errs;
  };

  // Core calculation
  const calculateTimeline = async () => {
    const newWarnings = validateInputs();
    if (newWarnings.length > 0) {
      setWarnings(newWarnings);
      setTimeline(null);
      return;
    }
    setWarnings([]);

    // set timestamp if missing
    if (!timestamp) setTimestamp(new Date().toISOString());

    // Compute per-phase days taking skip flags into account
    const editorialDays = editorial.dataCollection
      + editorial.writing
      + editorial.subEditing
      + editorial.internalProofreading
      + (!editorial.skipReview1 ? editorial.clientReview1 : 0)
      + (!editorial.skipReview2 ? editorial.clientReview2 : 0)
      + (!editorial.skipReview3 ? editorial.clientReview3 : 0)
      + editorial.finalReview
      + editorial.contingency;

    const creativeDays = (creative.themeAvailable ? 0 : creative.themeDays)
      + (!creative.skipRev1 ? creative.themeRev1 : 0)
      + (!creative.skipRev2 ? creative.themeRev2 : 0)
      + creative.designDuration;

    const pagesPerDay = design.layoutType === 'text-based' ? 10 : 5;
    const basePagesPerDay = pagesPerDay * Math.max(1, design.numberOfDesigners);
    const designWorkDays = Math.max(1, Math.ceil(design.pages / basePagesPerDay));
    const designDays = designWorkDays
      + design.editorialProofreading
      + (!design.skipReview1 ? design.review1 : 0)
      + (!design.skipReview2 ? design.review2 : 0)
      + (!design.skipReview3 ? design.review3 : 0)
      + design.contingency
      + design.approval;

    const webDays = webDeliverablesRequired ? (webDeliverables.uiuxDays + webDeliverables.deploymentDays) : 0;
    const printDays = print.preparation + print.printDeliveryDays;

    // Global contingency applies to entire timeline. We'll add it as buffer before statutory or before final delivery.
    const totalInternalDays = editorialDays + creativeDays + designDays + webDays + printDays;
    const totalDays = totalInternalDays + globalContingency + statutory;

    if (totalDays > 365) setWarnings(['Total timeline exceeds 365 days. Consider revising durations']);

    // Build phases with forward or backward scheduling
    let phases: Phase[] = [];
    if (schedulingMode === 'backward') {
      const deadline = new Date(finalDate);
      // Apply statutory days after print. Global contingency is applied before statutory but after print production.
      const statutoryEnd = new Date(deadline);
      const statutoryStart = addWorkingDays(statutoryEnd, -statutory, false);

      const contingencyEnd = statutoryStart;
      const contingencyStart = addWorkingDays(contingencyEnd, -globalContingency, false);

      const printEnd = contingencyStart;
      const printStart = addWorkingDays(printEnd, -printDays, false);

      const designEnd = printStart;
      const designStart = addWorkingDays(designEnd, -designDays, false);

      // milestone 50% design delivery computed relative to designStart
      const design50 = addWorkingDays(designStart, Math.ceil(designWorkDays / 2), true);

      const creativeEnd = designStart;
      const creativeStart = addWorkingDays(creativeEnd, -creativeDays, false);

      const editorialEnd = creativeStart;
      const editorialStart = addWorkingDays(editorialEnd, -editorialDays, false);

      // web deliverables placed before print production
      const webEnd = printStart;
      const webStart = webDeliverablesRequired ? addWorkingDays(webEnd, -webDays, false) : null;

      // Calculate review dates for editorial (backward scheduling)
      let cumulativeDays = editorial.dataCollection + editorial.writing + editorial.subEditing + editorial.internalProofreading;
      const editorialReviews = [];
      const displayClientName = clientName || 'Client';
      if (!editorial.skipReview1) {
        editorialReviews.push({ name: `${displayClientName} Review 1`, date: addWorkingDays(editorialStart, cumulativeDays, true) });
        cumulativeDays += editorial.clientReview1;
      }
      if (!editorial.skipReview2) {
        editorialReviews.push({ name: `${displayClientName} Review 2`, date: addWorkingDays(editorialStart, cumulativeDays, true) });
        cumulativeDays += editorial.clientReview2;
      }
      if (!editorial.skipReview3) {
        editorialReviews.push({ name: `${displayClientName} Review 3`, date: addWorkingDays(editorialStart, cumulativeDays, true) });
      }

      phases = [
        { name: 'Editorial & Content', start: editorialStart, end: editorialEnd, days: editorialDays, reviews: editorialReviews },
        { name: 'Creative Development', start: creativeStart, end: creativeEnd, days: creativeDays, theme: creative.themeAvailable ? 'Theme available' : 'Theme development' },
        { name: 'Design & Layout', start: designStart, end: designEnd, days: designDays, milestones: [
          { name: '50% Delivery', date: design50 },
          { name: '100% Delivery', date: designEnd }
        ]},
      ];

      if (webDeliverablesRequired) phases.push({ name: 'Web Deliverables', start: webStart, end: webEnd, days: webDays });

      phases.push({ name: 'Print Production', start: printStart, end: printEnd, days: printDays });
      phases.push({ name: 'Global Contingency or Buffer Days', start: contingencyStart, end: contingencyEnd, days: globalContingency });
      phases.push({ name: 'Statutory Period', start: statutoryStart, end: statutoryEnd, days: statutory });

    } else {
      // Forward scheduling
      const sDate = new Date(startDate);
      const editorialStart = sDate;
      const editorialEnd = addWorkingDays(editorialStart, editorialDays, true);

      const creativeStart = editorialEnd;
      const creativeEnd = addWorkingDays(creativeStart, creativeDays, true);

      const designStart = creativeEnd;
      const designEnd = addWorkingDays(designStart, designDays, true);
      const design50 = addWorkingDays(designStart, Math.ceil(designWorkDays / 2), true);

      const webStart = webDeliverablesRequired ? addWorkingDays(designEnd, 1, true) : null; // put web work after design in forward mode
      const webEnd = webDeliverablesRequired ? addWorkingDays(webStart, webDays, true) : null;

      const printStart = webDeliverablesRequired ? webEnd : designEnd;
      const printEnd = addWorkingDays(printStart, printDays, true);

      const contingencyStart = addWorkingDays(printEnd, 1, true);
      const contingencyEnd = addWorkingDays(contingencyStart, globalContingency, true);

      const statutoryStart = addWorkingDays(contingencyEnd, 1, true);
      const statutoryEnd = addWorkingDays(statutoryStart, statutory, true);

      // Calculate review dates for editorial (forward scheduling)
      let cumulativeDaysForward = editorial.dataCollection + editorial.writing + editorial.subEditing + editorial.internalProofreading;
      const editorialReviewsForward = [];
      const displayClientNameForward = clientName || 'Client';
      if (!editorial.skipReview1) {
        editorialReviewsForward.push({ name: `${displayClientNameForward} Review 1`, date: addWorkingDays(editorialStart, cumulativeDaysForward, true) });
        cumulativeDaysForward += editorial.clientReview1;
      }
      if (!editorial.skipReview2) {
        editorialReviewsForward.push({ name: `${displayClientNameForward} Review 2`, date: addWorkingDays(editorialStart, cumulativeDaysForward, true) });
        cumulativeDaysForward += editorial.clientReview2;
      }
      if (!editorial.skipReview3) {
        editorialReviewsForward.push({ name: `${displayClientNameForward} Review 3`, date: addWorkingDays(editorialStart, cumulativeDaysForward, true) });
      }

      phases = [
        { name: 'Editorial & Content', start: editorialStart, end: editorialEnd, days: editorialDays, reviews: editorialReviewsForward },
        { name: 'Creative Development', start: creativeStart, end: creativeEnd, days: creativeDays, theme: creative.themeAvailable ? 'Theme available' : 'Theme development' },
        { name: 'Design & Layout', start: designStart, end: designEnd, days: designDays, milestones: [
          { name: '50% Delivery', date: design50 },
          { name: '100% Delivery', date: designEnd }
        ]},
      ];

      if (webDeliverablesRequired) phases.push({ name: 'Web Deliverables', start: webStart, end: webEnd, days: webDays });

      phases.push({ name: 'Print Production', start: printStart, end: printEnd, days: printDays });
      phases.push({ name: 'Global Contingency or Buffer Days', start: contingencyStart, end: contingencyEnd, days: globalContingency });
      phases.push({ name: 'Statutory Period', start: statutoryStart, end: statutoryEnd, days: statutory });
    }

    setTimeline({ phases, totalDays, totalInternalDays });

    // Save to database
    try {
      const data = {
        projectName,
        clientName: reportType,
        schedulingMethod: schedulingMode,
        startDate: startDate || undefined,
        endDate: finalDate || undefined,
        numberOfHolidays: parseInt(holidays) || 0,
        useExtendedWeekends: includeWeekends,
        finalDeliveryDays: statutory,
        globalContingency,
        excludeDays,
        excludeStartDate: excludeStartDate || undefined,
        excludeEndDate: excludeEndDate || undefined,
        excludeDescription: excludeDescription || undefined,
        editorial,
        creative,
        design,
        webDevelopment: {
          enabled: webDeliverablesRequired,
          frontendDevelopment: webDeliverables.uiuxDays,
          backendIntegration: 0,
          testing: webDeliverables.deploymentDays
        },
        printProduction: {
          prePressProofing: print.preparation,
          printing: print.printDeliveryDays,
          binding: 0
        }
      };

      const response = await fetch('/api/timeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (result.success) {
        setSavedTimelineId(result.uniqueId);
      } else {
        console.error('Failed to save timeline:', result.error);
      }
    } catch (error) {
      console.error('Error saving timeline:', error);
    }
  };

  const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Fetch saved timeline data from database
  const fetchSavedTimelineData = async () => {
    if (!savedTimelineId) {
      alert('Please calculate the timeline first.');
      return null;
    }

    try {
      const response = await fetch(`/api/timeline?id=${savedTimelineId}`);
      const result = await response.json();

      if (result.success && result.data) {
        return result.data;
      } else {
        alert('Failed to fetch timeline data.');
        return null;
      }
    } catch (error) {
      console.error('Error fetching timeline:', error);
      alert('An error occurred while fetching the timeline.');
      return null;
    }
  };

  // copy summary text
  const exportToText = () => {
    if (!timeline) return;
    let text = `PROJECT: ${projectName}\nType: ${reportType}\nGenerated: ${new Date().toLocaleString()}\nMode: ${schedulingMode === 'backward' ? 'Backward (from deadline)' : 'Forward (from start)'}\n`;
    text += `Layout Type: ${design.layoutType === 'text-based' ? 'Text Based (10 pages/day)' : 'Heavy Infographics (5 pages/day)'}\n`;
    text += `Total Duration: ${timeline.totalDays} days\nStatutory Days: ${statutory}\n`;

    if (excludeDays && excludeStartDate && excludeEndDate) {
      text += `Excluded Period: ${formatDate(new Date(excludeStartDate))} to ${formatDate(new Date(excludeEndDate))}`;
      if (excludeDescription) text += ` - ${excludeDescription}`;
      text += ` (${calculateExcludedWorkingDays()} working days excluded)\n`;
    }

    text += `\nPHASES:\n${'='.repeat(50)}\n\n`;

    timeline.phases.forEach((p, i) => {
      text += `${i + 1}. ${p.name}\n  Start: ${formatDate(p.start)}\n  End:   ${formatDate(p.end)}\n  Days:  ${p.days}\n`;
      if (p.reviews) p.reviews.forEach(r => text += `    - ${r.name}: ${formatDate(r.date)}\n`);
      if (p.milestones) p.milestones.forEach(m => text += `    - ${m.name}: ${formatDate(m.date)}\n`);
      if (p.theme) text += `    Theme: ${p.theme}\n`;
      text += '\n';
    });

    text += `${'='.repeat(50)}\nExpected Day of Delivery: ${formatDate(timeline.phases[timeline.phases.length - 1]?.end)}\n`;

    navigator.clipboard.writeText(text);
    alert('Timeline copied to clipboard');
  };

  // Export to PDF
  const exportToPDF = async () => {
    if (!timeline) return;

    const savedData = await fetchSavedTimelineData();
    if (!savedData) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Header with gradient background (simulated with rectangle)
    doc.setFillColor(37, 99, 235); // Blue color
    doc.rect(0, 0, pageWidth, 35, 'F');

    // Title in white
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Report / Publication Timeline', pageWidth / 2, 15, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(savedData.projectName, pageWidth / 2, 23, { align: 'center' });
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}`, pageWidth / 2, 29, { align: 'center' });

    // Reset text color
    doc.setTextColor(0, 0, 0);

    // Project Information Section
    let yPosition = 45;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 99, 235);
    doc.text('Project Information', 14, yPosition);

    // Draw line under section header
    doc.setDrawColor(37, 99, 235);
    doc.setLineWidth(0.5);
    doc.line(14, yPosition + 1, pageWidth - 14, yPosition + 1);

    yPosition += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);

    // Two-column layout for project info
    const leftCol = 14;
    const rightCol = pageWidth / 2 + 5;

    doc.setFont('helvetica', 'bold');
    doc.text('Client:', leftCol, yPosition);
    doc.setFont('helvetica', 'normal');
    doc.text(savedData.clientName, leftCol + 25, yPosition);

    doc.setFont('helvetica', 'bold');
    doc.text('Scheduling Mode:', rightCol, yPosition);
    doc.setFont('helvetica', 'normal');
    doc.text(savedData.schedulingMethod === 'backward' ? 'Backward (from deadline)' : 'Forward (from start)', rightCol + 38, yPosition);

    yPosition += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('Layout Type:', leftCol, yPosition);
    doc.setFont('helvetica', 'normal');
    doc.text(savedData.design.layoutType === 'text-based' ? 'Text Based (10 pages/day)' : 'Heavy Infographics (5 pages/day)', leftCol + 25, yPosition);

    doc.setFont('helvetica', 'bold');
    doc.text('Total Duration:', rightCol, yPosition);
    doc.setFont('helvetica', 'normal');
    doc.text(`${timeline.totalDays} working days`, rightCol + 38, yPosition);

    yPosition += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('Statutory Days:', leftCol, yPosition);
    doc.setFont('helvetica', 'normal');
    doc.text(`${savedData.finalDeliveryDays} days`, leftCol + 25, yPosition);

    // Excluded period info if applicable
    if (savedData.excludeDays && savedData.excludeStartDate && savedData.excludeEndDate) {
      yPosition += 8;
      doc.setFillColor(255, 237, 213); // Light orange background
      doc.roundedRect(14, yPosition - 4, pageWidth - 28, 12, 2, 2, 'F');

      doc.setFontSize(9);
      doc.setTextColor(194, 65, 12); // Dark orange text
      doc.setFont('helvetica', 'bold');
      doc.text('⚠ Excluded Period:', 16, yPosition);
      doc.setFont('helvetica', 'normal');
      let excludeText = `${formatDate(new Date(savedData.excludeStartDate))} to ${formatDate(new Date(savedData.excludeEndDate))}`;
      if (savedData.excludeDescription) excludeText += ` - ${savedData.excludeDescription}`;
      excludeText += ` (${calculateExcludedWorkingDays()} working days excluded)`;
      doc.text(excludeText, 16, yPosition + 5);
      yPosition += 12;
      doc.setFontSize(10);
    }

    yPosition += 10;

    // Timeline Section Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(37, 99, 235);
    doc.text('Project Timeline', 14, yPosition);
    doc.setDrawColor(37, 99, 235);
    doc.line(14, yPosition + 1, pageWidth - 14, yPosition + 1);

    yPosition += 6;

    // Prepare table data
    const tableData: any[] = [];
    timeline.phases.forEach((phase) => {
      tableData.push([
        phase.name,
        formatDate(phase.start),
        formatDate(phase.end),
        phase.days.toString()
      ]);

      if (phase.reviews) {
        phase.reviews.forEach(review => {
          tableData.push([
            `  └─ ${review.name}`,
            formatDate(review.date),
            '',
            ''
          ]);
        });
      }

      if (phase.milestones) {
        phase.milestones.forEach(milestone => {
          tableData.push([
            `  └─ ${milestone.name}`,
            formatDate(milestone.date),
            '',
            ''
          ]);
        });
      }

      if (phase.theme) {
        tableData.push([
          `  └─ Theme: ${phase.theme}`,
          '',
          '',
          ''
        ]);
      }
    });

    // Add table with professional styling
    autoTable(doc, {
      startY: yPosition,
      head: [['Phase', 'Start Date', 'End Date', 'Days']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: [255, 255, 255],
        fontSize: 10,
        fontStyle: 'bold',
        halign: 'left',
        cellPadding: 3
      },
      styles: {
        fontSize: 9,
        cellPadding: 2.5,
        lineColor: [226, 232, 240],
        lineWidth: 0.1
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 80, fontStyle: 'normal' },
        1: { cellWidth: 35, halign: 'center' },
        2: { cellWidth: 35, halign: 'center' },
        3: { cellWidth: 20, halign: 'center' }
      },
      didParseCell: (data) => {
        // Style milestone/review rows differently
        if (data.section === 'body' && data.column.index === 0) {
          const cellText = data.cell.raw as string;
          if (cellText && cellText.includes('└─')) {
            data.cell.styles.textColor = [100, 116, 139];
            data.cell.styles.fontSize = 8;
          }
        }
      }
    });

    // Add professional footer with expected delivery date
    const docWithTable = doc as typeof doc & { lastAutoTable?: { finalY: number } };
    const finalY = docWithTable.lastAutoTable?.finalY || yPosition;

    // Footer box with light blue background
    const footerY = finalY + 8;
    doc.setFillColor(239, 246, 255);
    doc.roundedRect(14, footerY, pageWidth - 28, 16, 2, 2, 'F');

    // Expected delivery date text
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 99, 235);
    doc.text('Expected Day of Delivery:', 18, footerY + 7);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.setFontSize(11);
    doc.text(formatDate(timeline.phases[timeline.phases.length - 1]?.end), 18, footerY + 13);

    // Generated timestamp at bottom
    const timestamp = footerY + 25;
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'italic');
    doc.text(`Generated on ${new Date().toLocaleString()}`, pageWidth / 2, timestamp, { align: 'center' });

    // Save the PDF
    doc.save(`${savedData.projectName.replace(/\s+/g, '_')}_Timeline.pdf`);
  };

  // Export to Excel
  const exportToExcel = async () => {
    if (!timeline) return;

    const savedData = await fetchSavedTimelineData();
    if (!savedData) return;

    // Prepare data for Excel
    const worksheetData: any[] = [
      ['Report / Publication Timeline'],
      [],
      ['Project:', savedData.projectName],
      ['Client:', savedData.clientName],
      ['Generated:', new Date().toLocaleString()],
      ['Scheduling Mode:', savedData.schedulingMethod === 'backward' ? 'Backward (from deadline)' : 'Forward (from start)'],
      ['Layout Type:', savedData.design.layoutType === 'text-based' ? 'Text Based (10 pages/day)' : 'Heavy Infographics (5 pages/day)'],
      ['Total Duration:', `${timeline.totalDays} working days`],
      ['Statutory Days:', savedData.finalDeliveryDays]
    ];

    // Add excluded period info if applicable
    if (savedData.excludeDays && savedData.excludeStartDate && savedData.excludeEndDate) {
      let excludeText = `${formatDate(new Date(savedData.excludeStartDate))} to ${formatDate(new Date(savedData.excludeEndDate))}`;
      if (savedData.excludeDescription) excludeText += ` - ${savedData.excludeDescription}`;
      excludeText += ` (${calculateExcludedWorkingDays()} working days excluded)`;
      worksheetData.push(['Excluded Period:', excludeText]);
    }

    worksheetData.push([]);
    worksheetData.push(['Phase', 'Start Date', 'End Date', 'Days']);

    timeline.phases.forEach((phase) => {
      worksheetData.push([
        phase.name,
        formatDate(phase.start),
        formatDate(phase.end),
        phase.days
      ]);

      if (phase.reviews) {
        phase.reviews.forEach(review => {
          worksheetData.push([
            `  └─ ${review.name}`,
            formatDate(review.date),
            '',
            ''
          ]);
        });
      }

      if (phase.milestones) {
        phase.milestones.forEach(milestone => {
          worksheetData.push([
            `  └─ ${milestone.name}`,
            formatDate(milestone.date),
            '',
            ''
          ]);
        });
      }

      if (phase.theme) {
        worksheetData.push([
          `  └─ Theme: ${phase.theme}`,
          '',
          '',
          ''
        ]);
      }
    });

    // Add expected delivery date
    worksheetData.push([]);
    worksheetData.push(['Expected Day of Delivery:', formatDate(timeline.phases[timeline.phases.length - 1]?.end)]);

    // Create workbook and worksheet
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Timeline');

    // Set column widths
    ws['!cols'] = [
      { wch: 40 },
      { wch: 15 },
      { wch: 15 },
      { wch: 10 }
    ];

    // Save the Excel file
    XLSX.writeFile(wb, `${savedData.projectName.replace(/\s+/g, '_')}_Timeline.xlsx`);
  };

  // Save and Generate Link
  const saveAndGenerateLink = async () => {
    if (!savedTimelineId) {
      alert('Please calculate the timeline first before generating a link.');
      return;
    }

    const url = `${window.location.origin}/?id=${savedTimelineId}`;
    await navigator.clipboard.writeText(url);
    alert(`Shareable link copied to clipboard:\n${url}`);
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // small helper to mark required fields visually by returning className
  const requiredClass = (val) => val ? '' : 'border-red-500';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-slate-800 mb-1">Report / Publication Timeline Calculator</h1>
          <p className="text-slate-600">Calculate your complete schedule accounting for deadlines, milestones, and working-day rules</p>
        </div>

        <Card className="shadow rounded-lg overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-3">
            <CardTitle className="flex items-center gap-2 text-base"><Calendar className="w-5 h-5" /> Project Overview</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-6">
              {/* Basic Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700">
                    Project Title <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    className={`transition-all duration-200 ${requiredClass(projectName)} focus:ring-2 focus:ring-blue-500`}
                    value={projectName}
                    onChange={e => setProjectName(e.target.value)}
                    placeholder="Enter project title"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700">
                    Client Name
                  </Label>
                  <Input
                    className="transition-all duration-200 focus:ring-2 focus:ring-blue-500"
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    placeholder="Enter client name"
                  />
                  <p className="text-xs text-slate-500">Used in review names</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700">Type of Report</Label>
                  <Select value={reportType} onValueChange={(v) => setReportType(v)}>
                    <SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-blue-500">
                      <SelectValue placeholder="Select report type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Annual Report">Annual Report</SelectItem>
                      <SelectItem value="Sustainability Report">Sustainability Report</SelectItem>
                      <SelectItem value="Integrated Report">Integrated Report</SelectItem>
                      <SelectItem value="Stakeholder Report">Stakeholder Report</SelectItem>
                      <SelectItem value="Internal Publication">Internal Publication</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700">Timestamp</Label>
                  <Input
                    className="bg-slate-50 text-slate-600"
                    value={timestamp ? new Date(timestamp).toLocaleString() : ''}
                    readOnly
                  />
                </div>
              </div>

              {/* Scheduling Method */}
              <div className="border-t pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Label className="text-sm font-medium text-slate-700">Scheduling Method</Label>
                    <div className="flex flex-col gap-3 p-4 bg-slate-50 rounded-lg">
                      <label className="flex items-center gap-3 cursor-pointer hover:bg-white p-2 rounded transition-colors">
                        <input
                          type="radio"
                          checked={schedulingMode === 'backward'}
                          onChange={() => setSchedulingMode('backward')}
                          className="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">Backward Scheduling (from final delivery)</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer hover:bg-white p-2 rounded transition-colors">
                        <input
                          type="radio"
                          checked={schedulingMode === 'forward'}
                          onChange={() => setSchedulingMode('forward')}
                          className="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">Forward Scheduling (from start)</span>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700">
                      {schedulingMode === 'backward' ? 'Final Delivery Date' : 'Project Start Date'} <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      className={`transition-all duration-200 ${requiredClass(schedulingMode === 'backward' ? finalDate : startDate)} focus:ring-2 focus:ring-blue-500`}
                      type="date"
                      value={schedulingMode === 'backward' ? finalDate : startDate}
                      onChange={e => schedulingMode === 'backward' ? setFinalDate(e.target.value) : setStartDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Advanced Settings */}
              <div className="border-t pt-6">
                <h4 className="text-sm font-semibold text-slate-700 mb-4">Advanced Settings</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                      <Checkbox
                        checked={includeWeekends}
                        onCheckedChange={setIncludeWeekends}
                        id="inclWeekends"
                        className="data-[state=checked]:bg-blue-600"
                      />
                      <Label htmlFor="inclWeekends" className="text-sm text-slate-700 cursor-pointer">
                        Include weekends in calculations
                      </Label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700">Holidays (YYYY-MM-DD)</Label>
                    <Input
                      className="transition-all duration-200 focus:ring-2 focus:ring-blue-500"
                      value={holidays}
                      onChange={e => setHolidays(e.target.value)}
                      placeholder="2025-12-25,2025-12-26"
                    />
                    <p className="text-xs text-slate-500">Comma separated</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700">Statutory Days</Label>
                    <Input
                      type="number"
                      value={statutory}
                      onChange={e => setStatutory(parseInt(e.target.value) || 0)}
                      className="transition-all duration-200 focus:ring-2 focus:ring-blue-500"
                      min={0}
                      placeholder="0"
                    />
                    <p className="text-xs text-slate-500">After production</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700">Global Contingency or Buffer Days</Label>
                    <Input
                      type="number"
                      value={globalContingency}
                      onChange={e => setGlobalContingency(parseInt(e.target.value) || 0)}
                      className="transition-all duration-200 focus:ring-2 focus:ring-blue-500"
                      min={0}
                      placeholder="0"
                    />
                    <p className="text-xs text-slate-500">Days</p>
                  </div>
                </div>
              </div>

              {/* Exclude Days */}
              <div className="border-t pt-6">
                <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors mb-4">
                  <Checkbox
                    checked={excludeDays}
                    onCheckedChange={(checked) => setExcludeDays(checked === true)}
                    id="excludeDays"
                    className="data-[state=checked]:bg-blue-600"
                  />
                  <Label htmlFor="excludeDays" className="text-sm font-semibold text-slate-700 cursor-pointer">
                    Exclude Days from Timeline
                  </Label>
                </div>

                {excludeDays && (
                  <div className="space-y-4 pl-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">
                          Start Date <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          type="date"
                          value={excludeStartDate}
                          onChange={e => setExcludeStartDate(e.target.value)}
                          className="transition-all duration-200 focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">
                          End Date <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          type="date"
                          value={excludeEndDate}
                          onChange={e => setExcludeEndDate(e.target.value)}
                          className="transition-all duration-200 focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">Description</Label>
                      <Input
                        value={excludeDescription}
                        onChange={e => setExcludeDescription(e.target.value)}
                        className="transition-all duration-200 focus:ring-2 focus:ring-blue-500"
                        placeholder="E.g., Holiday break, Company shutdown, etc."
                      />
                      <p className="text-xs text-slate-500">Optional: Describe the reason for exclusion</p>
                    </div>

                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-800">
                        <strong>Note:</strong> These days will be excluded from the overall delivery timeline calculation.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {warnings.length > 0 && (
          <Alert className="border-red-500 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              {warnings.map((w, i) => <div key={i}>• {w}</div>)}
            </AlertDescription>
          </Alert>
        )}

        <Card className="shadow rounded-lg overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-purple-600 to-purple-700 text-white cursor-pointer p-3" onClick={() => toggleSection('editorial')}>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Editorial & Content Development</span>
              {expandedSections.editorial ? <ChevronUp /> : <ChevronDown />}
            </CardTitle>
          </CardHeader>
          {expandedSections.editorial && (
            <CardContent className="p-6">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700">Data Collection and Interviews</Label>
                    <Input
                      type="number"
                      value={editorial.dataCollection}
                      onChange={e => setEditorial({ ...editorial, dataCollection: parseInt(e.target.value) || 0 })}
                      className="transition-all duration-200 focus:ring-2 focus:ring-purple-500"
                      min={0}
                      placeholder="0"
                    />
                    <p className="text-xs text-slate-500">Days</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700">Writing</Label>
                    <Input
                      type="number"
                      value={editorial.writing}
                      onChange={e => setEditorial({ ...editorial, writing: parseInt(e.target.value) || 0 })}
                      className="transition-all duration-200 focus:ring-2 focus:ring-purple-500"
                      min={0}
                      placeholder="0"
                    />
                    <p className="text-xs text-slate-500">Days</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700">Sub-editing</Label>
                    <Input
                      type="number"
                      value={editorial.subEditing}
                      onChange={e => setEditorial({ ...editorial, subEditing: parseInt(e.target.value) || 0 })}
                      className="transition-all duration-200 focus:ring-2 focus:ring-purple-500"
                      min={0}
                      placeholder="0"
                    />
                    <p className="text-xs text-slate-500">Days</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700">Internal Proofreading</Label>
                    <Input
                      type="number"
                      value={editorial.internalProofreading}
                      onChange={e => setEditorial({ ...editorial, internalProofreading: parseInt(e.target.value) || 0 })}
                      className="transition-all duration-200 focus:ring-2 focus:ring-purple-500"
                      min={0}
                      placeholder="0"
                    />
                    <p className="text-xs text-slate-500">Days</p>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h4 className="text-sm font-semibold text-slate-700 mb-4">{clientName || 'Client'} Review and Feedback</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">{clientName || 'Client'} Review 1</Label>
                      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                        <Checkbox
                          checked={editorial.skipReview1}
                          onCheckedChange={(v) => setEditorial({ ...editorial, skipReview1: v })}
                          className="data-[state=checked]:bg-purple-600"
                        />
                        <Label className="text-sm text-slate-700">Skip</Label>
                        <Input
                          type="number"
                          value={editorial.clientReview1}
                          onChange={e => setEditorial({ ...editorial, clientReview1: parseInt(e.target.value) || 0 })}
                          className="flex-1 transition-all duration-200 focus:ring-2 focus:ring-purple-500"
                          placeholder="Days"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">{clientName || 'Client'} Review 2</Label>
                      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                        <Checkbox
                          checked={editorial.skipReview2}
                          onCheckedChange={(v) => setEditorial({ ...editorial, skipReview2: v })}
                          className="data-[state=checked]:bg-purple-600"
                        />
                        <Label className="text-sm text-slate-700">Skip</Label>
                        <Input
                          type="number"
                          value={editorial.clientReview2}
                          onChange={e => setEditorial({ ...editorial, clientReview2: parseInt(e.target.value) || 0 })}
                          className="flex-1 transition-all duration-200 focus:ring-2 focus:ring-purple-500"
                          placeholder="Days"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">{clientName || 'Client'} Review 3</Label>
                      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                        <Checkbox
                          checked={editorial.skipReview3}
                          onCheckedChange={(v) => setEditorial({ ...editorial, skipReview3: v })}
                          className="data-[state=checked]:bg-purple-600"
                        />
                        <Label className="text-sm text-slate-700">Skip</Label>
                        <Input
                          type="number"
                          value={editorial.clientReview3}
                          onChange={e => setEditorial({ ...editorial, clientReview3: parseInt(e.target.value) || 0 })}
                          className="flex-1 transition-all duration-200 focus:ring-2 focus:ring-purple-500"
                          placeholder="Days"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">Final Review & Submission</Label>
                      <Input
                        type="number"
                        value={editorial.finalReview}
                        onChange={e => setEditorial({ ...editorial, finalReview: parseInt(e.target.value) || 0 })}
                        className="transition-all duration-200 focus:ring-2 focus:ring-purple-500"
                        min={0}
                        placeholder="0"
                      />
                      <p className="text-xs text-slate-500">Days</p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">Contingency or Buffer Days</Label>
                      <Input
                        type="number"
                        value={editorial.contingency}
                        onChange={e => setEditorial({ ...editorial, contingency: parseInt(e.target.value) || 0 })}
                        className="transition-all duration-200 focus:ring-2 focus:ring-purple-500"
                        min={0}
                        placeholder="0"
                      />
                      <p className="text-xs text-slate-500">For this phase</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        <Card className="shadow rounded-lg overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-green-600 to-green-700 text-white cursor-pointer p-3" onClick={() => toggleSection('creative')}>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Creative Development</span>
              {expandedSections.creative ? <ChevronUp /> : <ChevronDown />}
            </CardTitle>
          </CardHeader>
          {expandedSections.creative && (
            <CardContent className="p-6">
              <div className="space-y-6">
                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                  <Checkbox
                    checked={creative.themeAvailable}
                    onCheckedChange={(v) => setCreative({ ...creative, themeAvailable: v })}
                    className="data-[state=checked]:bg-green-600"
                  />
                  <Label className="text-sm text-slate-700 cursor-pointer">
                    Theme available. Proceed to creative conceptualization ({creative.themeDays} days)
                  </Label>
                </div>

                {!creative.themeAvailable && (
                  <div className="border-t pt-6">
                    <h4 className="text-sm font-semibold text-slate-700 mb-4">Theme Development</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">Theme Development Days</Label>
                        <Input
                          type="number"
                          value={creative.themeDays}
                          onChange={e => setCreative({ ...creative, themeDays: parseInt(e.target.value) || 0 })}
                          className="transition-all duration-200 focus:ring-2 focus:ring-green-500"
                          min={0}
                          placeholder="0"
                        />
                        <p className="text-xs text-slate-500">Days</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">Theme Revision 1</Label>
                        <Input
                          type="number"
                          value={creative.themeRev1}
                          onChange={e => setCreative({ ...creative, themeRev1: parseInt(e.target.value) || 0 })}
                          className="transition-all duration-200 focus:ring-2 focus:ring-green-500"
                          min={0}
                          placeholder="0"
                        />
                        <p className="text-xs text-slate-500">Days</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">Theme Revision 2</Label>
                        <Input
                          type="number"
                          value={creative.themeRev2}
                          onChange={e => setCreative({ ...creative, themeRev2: parseInt(e.target.value) || 0 })}
                          className="transition-all duration-200 focus:ring-2 focus:ring-green-500"
                          min={0}
                          placeholder="0"
                        />
                        <p className="text-xs text-slate-500">Days</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className={!creative.themeAvailable ? "border-t pt-6" : ""}>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700">Creative Conceptualization Duration</Label>
                    <Input
                      type="number"
                      value={creative.designDuration}
                      onChange={e => setCreative({ ...creative, designDuration: parseInt(e.target.value) || 0 })}
                      className="transition-all duration-200 focus:ring-2 focus:ring-green-500 max-w-xs"
                      min={0}
                      placeholder="0"
                    />
                    <p className="text-xs text-slate-500">Days</p>
                  </div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        <Card className="shadow rounded-lg overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-orange-600 to-orange-700 text-white cursor-pointer p-3" onClick={() => toggleSection('design')}>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Publication Design & Layout</span>
              {expandedSections.design ? <ChevronUp /> : <ChevronDown />}
            </CardTitle>
          </CardHeader>
          {expandedSections.design && (
            <CardContent className="p-6">
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-3">
                    <Label className="text-sm font-medium text-slate-700">Layout Type</Label>
                    <div className="flex flex-col gap-3 p-4 bg-slate-50 rounded-lg">
                      <label className="flex items-center gap-3 cursor-pointer hover:bg-white p-2 rounded transition-colors">
                        <input
                          type="radio"
                          checked={design.layoutType === 'text-based'}
                          onChange={() => setDesign({ ...design, layoutType: 'text-based' })}
                          className="w-4 h-4 text-orange-600 focus:ring-2 focus:ring-orange-500"
                        />
                        <span className="text-sm text-slate-700">Text Based Layout (10 pages/day)</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer hover:bg-white p-2 rounded transition-colors">
                        <input
                          type="radio"
                          checked={design.layoutType === 'heavy-infographics'}
                          onChange={() => setDesign({ ...design, layoutType: 'heavy-infographics' })}
                          className="w-4 h-4 text-orange-600 focus:ring-2 focus:ring-orange-500"
                        />
                        <span className="text-sm text-slate-700">Heavy Infographics (5 pages/day)</span>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700">Number of Pages</Label>
                    <Input
                      type="number"
                      value={design.pages}
                      onChange={e => setDesign({ ...design, pages: parseInt(e.target.value) || 0 })}
                      className="transition-all duration-200 focus:ring-2 focus:ring-orange-500 max-w-xs"
                      min={1}
                      placeholder="40"
                    />
                    <p className="text-xs text-slate-500">
                      Rate: {design.layoutType === 'text-based' ? '10' : '5'} pages/day
                    </p>
                    <div className="mt-2 p-3 bg-orange-50 rounded-lg">
                      <p className="text-sm text-orange-800">
                        <strong>Estimated work days:</strong> {Math.max(1, Math.ceil(design.pages / (design.layoutType === 'text-based' ? 10 : 5)))} days
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <div className="space-y-2 mb-6">
                    <Label className="text-sm font-medium text-slate-700">Editorial Proofreading</Label>
                    <Input
                      type="number"
                      value={design.editorialProofreading}
                      onChange={e => setDesign({ ...design, editorialProofreading: parseInt(e.target.value) || 0 })}
                      className="transition-all duration-200 focus:ring-2 focus:ring-orange-500 max-w-xs"
                      min={0}
                      placeholder="0"
                    />
                    <p className="text-xs text-slate-500">Days for editorial proofreading before client reviews</p>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h4 className="text-sm font-semibold text-slate-700 mb-4">Client Reviews & Amendments</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">Review 1 Name</Label>
                      <Input
                        value={design.review1Name}
                        onChange={e => setDesign({ ...design, review1Name: e.target.value })}
                        className="transition-all duration-200 focus:ring-2 focus:ring-orange-500"
                        placeholder="Review name"
                      />
                      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                        <Checkbox
                          checked={design.skipReview1}
                          onCheckedChange={(v) => setDesign({ ...design, skipReview1: v })}
                          className="data-[state=checked]:bg-orange-600"
                        />
                        <Label className="text-sm text-slate-700">Skip</Label>
                        <Input
                          type="number"
                          value={design.review1}
                          onChange={e => setDesign({ ...design, review1: parseInt(e.target.value) || 0 })}
                          className="flex-1 transition-all duration-200 focus:ring-2 focus:ring-orange-500"
                          placeholder="Days"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">Review 2 Name</Label>
                      <Input
                        value={design.review2Name}
                        onChange={e => setDesign({ ...design, review2Name: e.target.value })}
                        className="transition-all duration-200 focus:ring-2 focus:ring-orange-500"
                        placeholder="Review name"
                      />
                      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                        <Checkbox
                          checked={design.skipReview2}
                          onCheckedChange={(v) => setDesign({ ...design, skipReview2: v })}
                          className="data-[state=checked]:bg-orange-600"
                        />
                        <Label className="text-sm text-slate-700">Skip</Label>
                        <Input
                          type="number"
                          value={design.review2}
                          onChange={e => setDesign({ ...design, review2: parseInt(e.target.value) || 0 })}
                          className="flex-1 transition-all duration-200 focus:ring-2 focus:ring-orange-500"
                          placeholder="Days"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">Review 3 Name</Label>
                      <Input
                        value={design.review3Name}
                        onChange={e => setDesign({ ...design, review3Name: e.target.value })}
                        className="transition-all duration-200 focus:ring-2 focus:ring-orange-500"
                        placeholder="Review name"
                      />
                      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                        <Checkbox
                          checked={design.skipReview3}
                          onCheckedChange={(v) => setDesign({ ...design, skipReview3: v })}
                          className="data-[state=checked]:bg-orange-600"
                        />
                        <Label className="text-sm text-slate-700">Skip</Label>
                        <Input
                          type="number"
                          value={design.review3}
                          onChange={e => setDesign({ ...design, review3: parseInt(e.target.value) || 0 })}
                          className="flex-1 transition-all duration-200 focus:ring-2 focus:ring-orange-500"
                          placeholder="Days"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">Contingency or Buffer Days</Label>
                      <Input
                        type="number"
                        value={design.contingency}
                        onChange={e => setDesign({ ...design, contingency: parseInt(e.target.value) || 0 })}
                        className="transition-all duration-200 focus:ring-2 focus:ring-orange-500"
                        min={0}
                        placeholder="0"
                      />
                      <p className="text-xs text-slate-500">Buffer days for this phase</p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">Approval Days</Label>
                      <Input
                        type="number"
                        value={design.approval}
                        onChange={e => setDesign({ ...design, approval: parseInt(e.target.value) || 0 })}
                        className="transition-all duration-200 focus:ring-2 focus:ring-orange-500"
                        min={0}
                        placeholder="0"
                      />
                      <p className="text-xs text-slate-500">Final approval time</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        <Card className="shadow rounded-lg overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-teal-600 to-teal-700 text-white cursor-pointer p-3" onClick={() => toggleSection('web')}>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Optional Web Version Development</span>
              {expandedSections.web ? <ChevronUp /> : <ChevronDown />}
            </CardTitle>
          </CardHeader>
          {expandedSections.web && (
            <CardContent className="p-6">
              <div className="space-y-6">
                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                  <Checkbox
                    checked={webDeliverablesRequired}
                    onCheckedChange={setWebDeliverablesRequired}
                    className="data-[state=checked]:bg-teal-600"
                  />
                  <Label className="text-sm text-slate-700 cursor-pointer font-medium">
                    Web Deliverables Required
                  </Label>
                </div>

                {webDeliverablesRequired && (
                  <div className="border-t pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">UI & UX Development</Label>
                        <Input
                          type="number"
                          value={webDeliverables.uiuxDays}
                          onChange={e => setWebDeliverables({ ...webDeliverables, uiuxDays: parseInt(e.target.value) || 0 })}
                          className="transition-all duration-200 focus:ring-2 focus:ring-teal-500"
                          min={0}
                          placeholder="0"
                        />
                        <p className="text-xs text-slate-500">Days</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">Deployment</Label>
                        <Input
                          type="number"
                          value={webDeliverables.deploymentDays}
                          onChange={e => setWebDeliverables({ ...webDeliverables, deploymentDays: parseInt(e.target.value) || 0 })}
                          className="transition-all duration-200 focus:ring-2 focus:ring-teal-500"
                          min={0}
                          placeholder="0"
                        />
                        <p className="text-xs text-slate-500">Days</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>

        <Card className="shadow rounded-lg overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-red-600 to-red-700 text-white cursor-pointer p-3" onClick={() => toggleSection('print')}>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Print Production (Preparation of files to go to print)</span>
              {expandedSections.print ? <ChevronUp /> : <ChevronDown />}
            </CardTitle>
          </CardHeader>
          {expandedSections.print && (
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700">Preparation & Submission</Label>
                  <Input
                    type="number"
                    value={print.preparation}
                    onChange={e => setPrint({ ...print, preparation: parseInt(e.target.value) || 0 })}
                    className="transition-all duration-200 focus:ring-2 focus:ring-red-500"
                    min={0}
                    placeholder="0"
                  />
                  <p className="text-xs text-slate-500">Days to prepare files for print</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700">Print Delivery</Label>
                  <Input
                    type="number"
                    value={print.printDeliveryDays}
                    onChange={e => setPrint({ ...print, printDeliveryDays: parseInt(e.target.value) || 0 })}
                    className="transition-all duration-200 focus:ring-2 focus:ring-red-500"
                    min={0}
                    placeholder="0"
                  />
                  <p className="text-xs text-slate-500">Days for printing and delivery</p>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        <div className="flex justify-center gap-4">
          <Button onClick={calculateTimeline} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3">
            <Clock className="w-5 h-5 mr-2" />
            Calculate Timeline
          </Button>
        </div>

        {timeline && (
          <Card className="shadow border-2 border-blue-200 rounded-lg overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-3">
              <CardTitle className="text-lg">Project Plan and Deliverables</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-6 p-4 bg-blue-50 rounded">
                <h3 className="font-semibold text-lg mb-3">Project Overview</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>Project Name: <strong>{projectName}</strong></div>
                  <div>Type: <strong>{reportType}</strong></div>
                  <div>Generated: <strong>{timestamp ? new Date(timestamp).toLocaleString() : '-'}</strong></div>
                  <div>Scheduling: <strong>{schedulingMode === 'backward' ? 'Backward' : 'Forward'}</strong></div>
                  <div>Statutory Days: <strong>{statutory}</strong></div>
                  <div>Total Duration: <strong>{timeline.totalDays} days</strong></div>
                  {excludeDays && excludeStartDate && excludeEndDate && (
                    <div className="md:col-span-3 text-orange-700">
                      Excluded Period: <strong>{formatDate(new Date(excludeStartDate))} to {formatDate(new Date(excludeEndDate))}</strong>
                      {excludeDescription && <span> - {excludeDescription}</span>}
                      {' '}({calculateExcludedWorkingDays()} working days excluded)
                    </div>
                  )}
                  <div className="md:col-span-3">Expected Day of Delivery: <strong>{formatDate(timeline.phases[timeline.phases.length - 1]?.end)}</strong></div>
                </div>
              </div>

              <div className="space-y-4">
                {/* Statutory Period displayed first, right below Project Overview */}
                {timeline.phases.filter(p => p.name === 'Statutory Period').map((phase, idx) => (
                  <div key={`statutory-${idx}`} className="border-l-4 border-blue-500 pl-4 py-3 bg-slate-50 rounded">
                    <h4 className="font-semibold">Statutory Days</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2 text-sm">
                      <div>Start: <strong>{formatDate(phase.start)}</strong></div>
                      <div>End: <strong>{formatDate(phase.end)}</strong></div>
                      <div>Duration: <strong>{phase.days} days</strong></div>
                    </div>
                  </div>
                ))}

                {/* All other phases in their original order */}
                {timeline.phases.filter(p => p.name !== 'Statutory Period').map((phase, idx) => {
                  const phaseMap: Record<string, string> = {
                    'Editorial & Content': 'Editorial & Content',
                    'Creative Development': 'Creative Development',
                    'Design & Layout': 'Design & Layout',
                    'Web Deliverables': 'Web Deliverables',
                    'Print Production': 'Print Production',
                    'Global Contingency or Buffer Days': 'Global Contingency or Buffer Days',
                  };
                  const displayName = phaseMap[phase.name] || phase.name;

                  return (
                    <div key={idx} className="border-l-4 border-blue-500 pl-4 py-3 bg-slate-50 rounded">
                      <h4 className="font-semibold">{displayName}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2 text-sm">
                        <div>Start: <strong>{formatDate(phase.start)}</strong></div>
                        <div>End: <strong>{formatDate(phase.end)}</strong></div>
                        <div>Duration: <strong>{phase.days} days</strong></div>
                      </div>

                      {phase.reviews && (
                        <div className="mt-2">
                          {phase.reviews.map((r, i) => <div key={i} className="text-sm">• {r.name}: <strong>{formatDate(r.date)}</strong></div>)}
                        </div>
                      )}

                      {phase.milestones && (
                        <div className="mt-2">
                          {phase.milestones.map((m, i) => <div key={i} className="text-sm">✓ {m.name}: <strong>{formatDate(m.date)}</strong></div>)}
                        </div>
                      )}

                      {phase.theme && <div className="mt-2 text-sm">Theme: <strong>{phase.theme}</strong></div>}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                <Button onClick={exportToText} variant="outline" className="flex items-center gap-2">
                  <Copy className="w-4 h-4" /> Copy to Clipboard
                </Button>
                <Button onClick={exportToPDF} variant="outline" className="flex items-center gap-2">
                  <Download className="w-4 h-4" /> Export PDF
                </Button>
                <Button onClick={exportToExcel} variant="outline" className="flex items-center gap-2">
                  <Download className="w-4 h-4" /> Export Excel
                </Button>
                <Button onClick={saveAndGenerateLink} variant="outline" className="flex items-center gap-2">
                  <Save className="w-4 h-4" /> Save / Generate Link
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="text-center text-sm text-slate-500 mt-8 pb-4">
          <p>© 2025 Report / Publication Timeline Calculator</p>
        </div>
      </div>
    </div>
  );
};

export default ReportTimelineCalculator;