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
    dataCollection: 40,
    writing: 40,
    subEditing: 20,
    internalProofreading: 5,
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
    themeDays: 5,
    themeRev1: 3,
    themeRev2: 3,
    designDuration: 9,
    skipRev1: false,
    skipRev2: false,
    finalSubmissionAuto: true
  });

  // Publication design & layout
  const [design, setDesign] = useState({
    pages: 250,
    layoutType: 'heavy-infographics', // 'text-based' or 'heavy-infographics'
    numberOfDesigners: 1,
    editorialProofreading: 7,
    review1: 4,
    review2: 4,
    review3: 4,
    contingency: 5,
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
            setClientName(data.clientName);
            setSchedulingMode(data.schedulingMethod);
            setStartDate(data.startDate ? new Date(data.startDate).toISOString().split('T')[0] : '');
            setFinalDate(data.endDate ? new Date(data.endDate).toISOString().split('T')[0] : '');
            setHolidays(data.numberOfHolidays ? data.numberOfHolidays.toString() : '');
            setIncludeWeekends(data.useExtendedWeekends);
            setStatutory(data.finalDeliveryDays);
            setGlobalContingency(data.globalContingency || 0);
            setExcludeDays(data.excludeDays || false);
            setExcludeStartDate(data.excludeStartDate || '');
            setExcludeEndDate(data.excludeEndDate || '');
            setExcludeDescription(data.excludeDescription || '');

            setEditorial(data.editorial);
            // Map creative data from DB structure back to frontend structure
            setCreative({
              themeAvailable: false,
              themeDays: data.creative.moodboardProduction,
              themeRev1: data.creative.creativeReview,
              themeRev2: data.creative.daysPerRound,
              designDuration: data.creative.conceptualization,
              skipRev1: false,
              skipRev2: data.creative.clientFeedbackRounds < 2,
              finalSubmissionAuto: true
            });
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

      // milestone for half design delivery computed relative to designStart
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
          { name: 'Half Delivery', date: design50 },
          { name: 'Full Delivery', date: designEnd }
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
          { name: 'Half Delivery', date: design50 },
          { name: 'Full Delivery', date: designEnd }
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
        clientName: clientName || reportType,
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
        creative: {
          conceptualization: creative.designDuration,
          moodboardProduction: creative.themeDays,
          creativeReview: creative.themeRev1,
          clientFeedbackRounds: creative.skipRev2 ? 1 : 2,
          daysPerRound: creative.themeRev2,
          finalCreativeApproval: 1
        },
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
    const pageHeight = doc.internal.pageSize.height;

    // Professional Header with gradient effect
    doc.setFillColor(30, 64, 175); // Darker blue
    doc.rect(0, 0, pageWidth, 25, 'F');

    // Add decorative line
    doc.setFillColor(59, 130, 246); // Lighter blue
    doc.rect(0, 23, pageWidth, 2, 'F');

    // Title
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Project Plan and Deliverables', pageWidth / 2, 14, { align: 'center' });

    // Subtitle
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(savedData.projectName, pageWidth / 2, 20, { align: 'center' });

    // Reset text color
    doc.setTextColor(0, 0, 0);

    // Project Overview Section
    let yPosition = 32;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175); // Blue color for titles
    doc.text('Project Overview', 14, yPosition);

    yPosition += 4;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0); // Black text

    const leftMargin = 14;
    const col1 = leftMargin;
    const col2 = 75;
    const col3 = 140;

    // Project Overview - 3 columns
    doc.setFont('helvetica', 'bold');
    doc.text('Project Name:', col1, yPosition);
    doc.setFont('helvetica', 'normal');
    doc.text(savedData.projectName, col1 + 22, yPosition);

    doc.setFont('helvetica', 'bold');
    doc.text('Generated:', col2, yPosition);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date().toLocaleString(), col2 + 18, yPosition);

    yPosition += 3;
    if (savedData.clientName) {
      doc.setFont('helvetica', 'bold');
      doc.text('Client Name:', col1, yPosition);
      doc.setFont('helvetica', 'normal');
      doc.text(savedData.clientName, col1 + 22, yPosition);
      yPosition += 3;
    }

    // Excluded period if applicable
    if (savedData.excludeDays && savedData.excludeStartDate && savedData.excludeEndDate) {
      yPosition += 3;
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      let excludeText = `Excluded Period: ${formatDate(new Date(savedData.excludeStartDate))} to ${formatDate(new Date(savedData.excludeEndDate))}`;
      if (savedData.excludeDescription) excludeText += ` - ${savedData.excludeDescription}`;
      excludeText += ` (${calculateExcludedWorkingDays()} working days excluded)`;
      const maxWidth = pageWidth - 28;
      const excludeLines = doc.splitTextToSize(excludeText, maxWidth);
      doc.text(excludeLines, leftMargin, yPosition);
      yPosition += excludeLines.length * 3;
    }

    // Expected Day of Delivery
    yPosition += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 64, 175); // Blue color for titles
    doc.text('Expected Day of Delivery:', leftMargin, yPosition);
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.text(formatDate(timeline.phases[timeline.phases.length - 1]?.end), leftMargin + 40, yPosition);

    yPosition += 6;
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0); // Black text
    doc.setFont('helvetica', 'normal');

    // Helper function to check if we need a new page
    const checkAndAddPage = (neededSpace: number) => {
      if (yPosition + neededSpace > pageHeight - 20) {
        doc.addPage();
        yPosition = 20;
        return true;
      }
      return false;
    };

    // Helper function to render a phase
    const renderPhase = (phase: any, idx: number) => {
      checkAndAddPage(30);

      yPosition += 4;

      // Phase header
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 64, 175); // Blue color for titles
      doc.text(phase.name, leftMargin, yPosition);

      yPosition += 4;
      doc.setFontSize(7);
      doc.setTextColor(0, 0, 0); // Black text
      doc.setFont('helvetica', 'normal');

      // Phase dates and duration - 3 columns with labels in bold
      doc.setFont('helvetica', 'bold');
      doc.text('Start:', col1, yPosition);
      doc.setFont('helvetica', 'normal');
      doc.text(formatDate(phase.start), col1 + 10, yPosition);

      doc.setFont('helvetica', 'bold');
      doc.text('End:', col2, yPosition);
      doc.setFont('helvetica', 'normal');
      doc.text(formatDate(phase.end), col2 + 8, yPosition);

      doc.setFont('helvetica', 'bold');
      doc.text('Duration:', col3, yPosition);
      doc.setFont('helvetica', 'normal');
      doc.text(`${phase.days} days`, col3 + 15, yPosition);

      yPosition += 3;

      // Phase-specific details
      if (phase.name === 'Editorial & Content') {
        doc.setFontSize(7);
        doc.text(`Data Collection: ${savedData.editorial.dataCollection} days`, col1, yPosition);
        doc.text(`Writing: ${savedData.editorial.writing} days`, col2, yPosition);
        doc.text(`Sub-editing: ${savedData.editorial.subEditing} days`, col3, yPosition);
        yPosition += 3;
        doc.text(`Internal Proofreading: ${savedData.editorial.internalProofreading} days`, col1, yPosition);
        if (!savedData.editorial.skipReview1) {
          doc.text(`${savedData.clientName || 'Client'} Review 1: ${savedData.editorial.clientReview1} days`, col2, yPosition);
        }
        if (!savedData.editorial.skipReview2) {
          doc.text(`${savedData.clientName || 'Client'} Review 2: ${savedData.editorial.clientReview2} days`, col3, yPosition);
        }
        yPosition += 3;
        if (!savedData.editorial.skipReview3) {
          doc.text(`${savedData.clientName || 'Client'} Review 3: ${savedData.editorial.clientReview3} days`, col1, yPosition);
        }
        doc.text(`Final Review: ${savedData.editorial.finalReview} days`, col2, yPosition);
        yPosition += 3;
      } else if (phase.name === 'Creative Development') {
        doc.text(`Theme Development: ${savedData.creative.moodboardProduction} days`, col1, yPosition);
        doc.text(`${savedData.clientName || 'Client'} Review 1: ${savedData.creative.creativeReview} days`, col2, yPosition);
        doc.text(`${savedData.clientName || 'Client'} Review 2: ${savedData.creative.daysPerRound} days`, col3, yPosition);
        yPosition += 3;
        doc.text(`Creative Conceptualization: ${savedData.creative.conceptualization} days`, col1, yPosition);
        yPosition += 3;
        if (phase.theme) {
          doc.text(`Theme Status: ${phase.theme}`, col1, yPosition);
          yPosition += 3;
        }
      } else if (phase.name === 'Design & Layout') {
        doc.text(`Number of Pages: ${savedData.design.pages}`, col1, yPosition);
        doc.text(`Layout Type: ${savedData.design.layoutType === 'text-based' ? 'Text Based' : 'Heavy Infographics'}`, col2, yPosition);
        yPosition += 3;
        doc.text(`Number of Designers: ${savedData.design.numberOfDesigners}`, col1, yPosition);
        const layoutDays = Math.max(1, Math.ceil(savedData.design.pages / ((savedData.design.layoutType === 'text-based' ? 10 : 5) * Math.max(1, savedData.design.numberOfDesigners))));
        doc.text(`Layout Work: ${layoutDays} days`, col2, yPosition);
        doc.text(`Editorial Proofreading: ${savedData.design.editorialProofreading} days`, col3, yPosition);
        yPosition += 3;
        if (!savedData.design.skipReview1) {
          doc.text(`${savedData.clientName || 'Client'} Review 1: ${savedData.design.review1} days`, col1, yPosition);
        }
        if (!savedData.design.skipReview2) {
          doc.text(`${savedData.clientName || 'Client'} Review 2: ${savedData.design.review2} days`, col2, yPosition);
        }
        if (!savedData.design.skipReview3) {
          doc.text(`${savedData.clientName || 'Client'} Review 3: ${savedData.design.review3} days`, col3, yPosition);
        }
        yPosition += 3;
        if (savedData.design.contingency > 0) {
          doc.text(`Contingency: ${savedData.design.contingency} days`, col1, yPosition);
        }
        doc.text(`Final Approval: ${savedData.design.approval} days`, col2, yPosition);
        yPosition += 3;
      } else if (phase.name === 'Web Deliverables' && savedData.webDevelopment.enabled) {
        doc.text(`UI & UX Development: ${savedData.webDevelopment.frontendDevelopment} days`, col1, yPosition);
        doc.text(`Deployment: ${savedData.webDevelopment.testing} days`, col2, yPosition);
        yPosition += 3;
      } else if (phase.name === 'Print Production') {
        doc.text(`Preparation & Submission: ${savedData.printProduction.prePressProofing} days`, col1, yPosition);
        doc.text(`Print Delivery: ${savedData.printProduction.printing} days`, col2, yPosition);
        yPosition += 3;
      }

      // Review Milestones
      if (phase.reviews && phase.reviews.length > 0) {
        checkAndAddPage(phase.reviews.length * 3 + 5);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 64, 175); // Blue color for titles
        doc.text('Review Milestones:', leftMargin, yPosition);
        yPosition += 3;
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0); // Black text
        phase.reviews.forEach(review => {
          doc.text(`${review.name}: ${formatDate(review.date)}`, leftMargin, yPosition);
          yPosition += 3;
        });
      }

      // Key Milestones
      if (phase.milestones && phase.milestones.length > 0) {
        checkAndAddPage(phase.milestones.length * 3 + 5);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 64, 175); // Blue color for titles
        doc.text('Key Milestones:', leftMargin, yPosition);
        yPosition += 3;
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0); // Black text
        phase.milestones.forEach(milestone => {
          doc.text(`${milestone.name}: ${formatDate(milestone.date)}`, leftMargin, yPosition);
          yPosition += 3;
        });
      }
    };

    // Process Statutory Period first (right after Project Overview)
    const statutoryPhase = timeline.phases.find(p => p.name === 'Statutory Period');
    if (statutoryPhase) {
      renderPhase(statutoryPhase, 0);
    }

    // Process all other phases
    timeline.phases.filter(p => p.name !== 'Statutory Period').forEach((phase, idx) => {
      renderPhase(phase, idx);
    });

    // Footer
    yPosition += 4;
    checkAndAddPage(10);
    doc.setFontSize(6);
    doc.setTextColor(0, 0, 0); // Black text
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated on ${new Date().toLocaleString()}`, pageWidth / 2, yPosition, { align: 'center' });

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
      ['Number of Pages:', savedData.design.pages],
      ['Number of Designers:', `${savedData.design.numberOfDesigners} designer${savedData.design.numberOfDesigners > 1 ? 's' : ''}`],
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
                        <Label className="text-sm font-medium text-slate-700">{clientName || 'Client'} Review 1</Label>
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
                        <Label className="text-sm font-medium text-slate-700">{clientName || 'Client'} Review 2</Label>
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

        <Card className="shadow-lg rounded-lg overflow-hidden border-2 border-orange-200">
          <CardHeader className="bg-gradient-to-r from-orange-600 to-orange-700 text-white cursor-pointer p-4" onClick={() => toggleSection('design')}>
            <CardTitle className="flex items-center justify-between text-lg font-bold">
              <span>Publication Design & Layout</span>
              {expandedSections.design ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </CardTitle>
          </CardHeader>
          {expandedSections.design && (
            <CardContent className="p-6 bg-gradient-to-br from-orange-50 to-slate-50">
              <div className="space-y-6">
                <div className="bg-white p-5 rounded-lg shadow-sm border border-orange-200">
                  <h4 className="text-base font-semibold text-orange-800 mb-4 flex items-center gap-2">
                    <span className="w-1 h-6 bg-orange-600 rounded"></span>
                    Layout Configuration
                  </h4>
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <Label className="text-sm font-medium text-slate-700">Layout Type</Label>
                      <div className="flex flex-col gap-3 p-4 bg-gradient-to-br from-orange-50 to-slate-50 rounded-lg border border-orange-200">
                        <label className="flex items-center gap-3 cursor-pointer hover:bg-white p-3 rounded transition-all hover:shadow-sm">
                          <input
                            type="radio"
                            checked={design.layoutType === 'text-based'}
                            onChange={() => setDesign({ ...design, layoutType: 'text-based' })}
                            className="w-5 h-5 text-orange-600 focus:ring-2 focus:ring-orange-500"
                          />
                          <span className="text-sm font-medium text-slate-700">Text Based Layout (10 pages/day)</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer hover:bg-white p-3 rounded transition-all hover:shadow-sm">
                          <input
                            type="radio"
                            checked={design.layoutType === 'heavy-infographics'}
                            onChange={() => setDesign({ ...design, layoutType: 'heavy-infographics' })}
                            className="w-5 h-5 text-orange-600 focus:ring-2 focus:ring-orange-500"
                          />
                          <span className="text-sm font-medium text-slate-700">Heavy Infographics (5 pages/day)</span>
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">Number of Pages</Label>
                        <Input
                          type="number"
                          value={design.pages}
                          onChange={e => setDesign({ ...design, pages: parseInt(e.target.value) || 0 })}
                          className="transition-all duration-200 focus:ring-2 focus:ring-orange-500"
                          min={1}
                          placeholder="250"
                        />
                        <p className="text-xs text-slate-500">
                          Rate: {design.layoutType === 'text-based' ? '10' : '5'} pages/day per designer
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">Number of Designers</Label>
                        <Input
                          type="number"
                          value={design.numberOfDesigners}
                          onChange={e => setDesign({ ...design, numberOfDesigners: Math.max(1, parseInt(e.target.value) || 1) })}
                          className="transition-all duration-200 focus:ring-2 focus:ring-orange-500"
                          min={1}
                          placeholder="1"
                        />
                        <p className="text-xs text-slate-500">
                          Working on layout: {design.numberOfDesigners} designer{design.numberOfDesigners > 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>

                    <div className="p-4 bg-gradient-to-r from-orange-100 to-orange-50 rounded-lg border-l-4 border-orange-600 shadow-sm">
                      <p className="text-sm font-semibold text-orange-900">
                        <strong>Estimated Layout Work Days:</strong> {Math.max(1, Math.ceil(design.pages / ((design.layoutType === 'text-based' ? 10 : 5) * Math.max(1, design.numberOfDesigners))))} days
                      </p>
                      <p className="text-xs text-orange-700 mt-1">
                        Based on {design.pages} pages ÷ ({design.layoutType === 'text-based' ? '10' : '5'} pages/day × {design.numberOfDesigners} designer{design.numberOfDesigners > 1 ? 's' : ''})
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-lg shadow-sm border border-orange-200">
                  <h4 className="text-base font-semibold text-orange-800 mb-4 flex items-center gap-2">
                    <span className="w-1 h-6 bg-orange-600 rounded"></span>
                    Editorial Proofreading
                  </h4>
                  <div className="space-y-2">
                    <Input
                      type="number"
                      value={design.editorialProofreading}
                      onChange={e => setDesign({ ...design, editorialProofreading: parseInt(e.target.value) || 0 })}
                      className="transition-all duration-200 focus:ring-2 focus:ring-orange-500 max-w-xs"
                      min={0}
                      placeholder="7"
                    />
                    <p className="text-xs text-slate-500">Days for editorial proofreading before client reviews</p>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h4 className="text-sm font-semibold text-slate-700 mb-4">{clientName || 'Client'} Reviews & Amendments</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">{clientName || 'Client'} Review 1</Label>
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
                      <Label className="text-sm font-medium text-slate-700">{clientName || 'Client'} Review 2</Label>
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
                      <Label className="text-sm font-medium text-slate-700">{clientName || 'Client'} Review 3</Label>
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
          <Card className="shadow-lg border-2 border-blue-200 rounded-lg overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <Calendar className="w-6 h-6" />
                Project Plan and Deliverables
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="mb-6 p-5 bg-gradient-to-br from-blue-50 to-slate-50 rounded-lg border border-blue-100 shadow-sm">
                <h3 className="font-bold text-xl mb-4 text-slate-800 border-b border-blue-200 pb-2">Project Overview</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-sm text-slate-700">
                  <div>Project Name: {projectName}</div>
                  <div>Generated: {timestamp ? new Date(timestamp).toLocaleString() : '-'}</div>
                  {clientName && <div>Client Name: {clientName}</div>}
                  {excludeDays && excludeStartDate && excludeEndDate && (
                    <div className="md:col-span-3">
                      <p className="text-xs italic text-slate-500">
                        Excluded Period: {formatDate(new Date(excludeStartDate))} to {formatDate(new Date(excludeEndDate))}
                        {excludeDescription && <span> - {excludeDescription}</span>}
                        {' '}({calculateExcludedWorkingDays()} working days excluded)
                      </p>
                    </div>
                  )}
                  <div className="md:col-span-3 mt-3 pt-3 border-t border-blue-200">
                    <div className="flex items-center gap-2 text-lg">
                      <span className="text-slate-600">Expected Day of Delivery:</span>
                      <strong className="text-blue-700 text-xl">{formatDate(timeline.phases[timeline.phases.length - 1]?.end)}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {/* Statutory Period displayed first, right below Project Overview */}
                {timeline.phases.filter(p => p.name === 'Statutory Period').map((phase, idx) => (
                  <div key={`statutory-${idx}`} className="border-l-4 border-blue-600 pl-5 py-4 bg-gradient-to-r from-blue-50 to-slate-50 rounded-lg shadow-sm">
                    <h4 className="font-bold text-base text-slate-800 mb-3">Statutory Days</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-sm text-slate-700">
                      <div>Start: {formatDate(phase.start)}</div>
                      <div>End: {formatDate(phase.end)}</div>
                      <div>Duration: {phase.days} days</div>
                      {holidays && <div>Number of Holidays: {holidays}</div>}
                      {includeWeekends && <div className="md:col-span-2">Extended Weekends: Yes</div>}
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

                  // Determine border color based on phase type
                  const borderColors: Record<string, string> = {
                    'Editorial & Content': 'border-purple-600',
                    'Creative Development': 'border-green-600',
                    'Design & Layout': 'border-orange-600',
                    'Web Deliverables': 'border-teal-600',
                    'Print Production': 'border-red-600',
                    'Global Contingency or Buffer Days': 'border-yellow-600',
                  };
                  const borderColor = borderColors[phase.name] || 'border-blue-600';

                  return (
                    <div key={idx} className={`border-l-4 ${borderColor} pl-5 py-4 bg-gradient-to-r from-slate-50 to-white rounded-lg shadow-sm hover:shadow-md transition-shadow`}>
                      <h4 className="font-bold text-base text-slate-800 mb-3">{displayName}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-sm text-slate-700 mb-3">
                        <div>Start: {formatDate(phase.start)}</div>
                        <div>End: {formatDate(phase.end)}</div>
                        <div>Duration: {phase.days} days</div>
                      </div>

                      {/* Editorial & Content Details */}
                      {phase.name === 'Editorial & Content' && (
                        <div className="mt-4 p-3 bg-purple-50 rounded-lg border-l-2 border-purple-300">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-sm text-slate-700">
                            <div>Data Collection: {editorial.dataCollection} days</div>
                            <div>Writing: {editorial.writing} days</div>
                            <div>Sub-editing: {editorial.subEditing} days</div>
                            <div>Internal Proofreading: {editorial.internalProofreading} days</div>
                            {!editorial.skipReview1 && <div>{clientName || 'Client'} Review 1: {editorial.clientReview1} days</div>}
                            {!editorial.skipReview2 && <div>{clientName || 'Client'} Review 2: {editorial.clientReview2} days</div>}
                            {!editorial.skipReview3 && <div>{clientName || 'Client'} Review 3: {editorial.clientReview3} days</div>}
                            <div>Final Review: {editorial.finalReview} days</div>
                            {editorial.contingency > 0 && <div>Contingency: {editorial.contingency} days</div>}
                          </div>
                        </div>
                      )}

                      {/* Creative Development Details */}
                      {phase.name === 'Creative Development' && (
                        <div className="mt-4 p-3 bg-green-50 rounded-lg border-l-2 border-green-300">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-sm text-slate-700">
                            {!creative.themeAvailable && <div>Theme Development: {creative.themeDays} days</div>}
                            {!creative.themeAvailable && !creative.skipRev1 && <div>{clientName || 'Client'} Review 1: {creative.themeRev1} days</div>}
                            {!creative.themeAvailable && !creative.skipRev2 && <div>{clientName || 'Client'} Review 2: {creative.themeRev2} days</div>}
                            <div>Creative Conceptualization: {creative.designDuration} days</div>
                            {creative.themeAvailable && <div className="text-green-700 md:col-span-2">Theme Status: Available</div>}
                          </div>
                        </div>
                      )}

                      {/* Design & Layout Details */}
                      {phase.name === 'Design & Layout' && (
                        <div className="mt-4 p-3 bg-orange-50 rounded-lg border-l-2 border-orange-300">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-sm text-slate-700">
                            <div>Number of Pages: {design.pages}</div>
                            <div>Layout Type: {design.layoutType === 'text-based' ? 'Text-based (10 pages/day)' : 'Heavy Infographics (5 pages/day)'}</div>
                            <div>Number of Designers: {design.numberOfDesigners}</div>
                            <div>Layout Work: {Math.max(1, Math.ceil(design.pages / ((design.layoutType === 'text-based' ? 10 : 5) * Math.max(1, design.numberOfDesigners))))} days</div>
                            <div>Editorial Proofreading: {design.editorialProofreading} days</div>
                            {!design.skipReview1 && <div>{clientName || 'Client'} Review 1: {design.review1} days</div>}
                            {!design.skipReview2 && <div>{clientName || 'Client'} Review 2: {design.review2} days</div>}
                            {!design.skipReview3 && <div>{clientName || 'Client'} Review 3: {design.review3} days</div>}
                            {design.contingency > 0 && <div>Contingency: {design.contingency} days</div>}
                            <div>Final Approval: {design.approval} days</div>
                          </div>
                        </div>
                      )}

                      {/* Web Deliverables Details */}
                      {phase.name === 'Web Deliverables' && webDeliverablesRequired && (
                        <div className="mt-4 p-3 bg-teal-50 rounded-lg border-l-2 border-teal-300">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-sm text-slate-700">
                            <div>UI & UX Development: {webDeliverables.uiuxDays} days</div>
                            <div>Deployment: {webDeliverables.deploymentDays} days</div>
                          </div>
                        </div>
                      )}

                      {/* Print Production Details */}
                      {phase.name === 'Print Production' && (
                        <div className="mt-4 p-3 bg-red-50 rounded-lg border-l-2 border-red-300">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-sm text-slate-700">
                            <div>Preparation & Submission: {print.preparation} days</div>
                            <div>Print Delivery: {print.printDeliveryDays} days</div>
                          </div>
                        </div>
                      )}

                      {phase.reviews && phase.reviews.length > 0 && (
                        <div className="mt-4 p-3 bg-slate-100 rounded-lg border-l-2 border-slate-400">
                          <div className="font-semibold text-slate-800 mb-2 text-sm">Review Milestones:</div>
                          <div className="space-y-1">
                            {phase.reviews.map((r, i) => <div key={i} className="text-sm text-slate-700">• {r.name}: <strong>{formatDate(r.date)}</strong></div>)}
                          </div>
                        </div>
                      )}

                      {phase.milestones && (
                        <div className="mt-4 p-3 bg-blue-50 rounded-lg border-l-2 border-blue-400">
                          <div className="font-semibold text-slate-800 mb-2 text-sm">Key Milestones:</div>
                          <div className="space-y-1">
                            {phase.milestones.map((m, i) => <div key={i} className="text-sm text-slate-700">✓ {m.name}: <strong>{formatDate(m.date)}</strong></div>)}
                          </div>
                        </div>
                      )}

                      {phase.theme && (
                        <div className="mt-3 p-2 bg-slate-50 rounded text-sm text-slate-700 border-l-2 border-slate-300">
                          Theme Status: <strong>{phase.theme}</strong>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-200">
                <div className="flex flex-wrap gap-3 justify-center">
                  <Button onClick={exportToText} variant="outline" className="flex items-center gap-2 hover:bg-slate-100 transition-colors shadow-sm">
                    <Copy className="w-4 h-4" /> Copy to Clipboard
                  </Button>
                  <Button onClick={exportToPDF} variant="outline" className="flex items-center gap-2 hover:bg-red-50 hover:border-red-300 transition-colors shadow-sm">
                    <Download className="w-4 h-4" /> Export PDF
                  </Button>
                  <Button onClick={exportToExcel} variant="outline" className="flex items-center gap-2 hover:bg-green-50 hover:border-green-300 transition-colors shadow-sm">
                    <Download className="w-4 h-4" /> Export Excel
                  </Button>
                  <Button onClick={saveAndGenerateLink} variant="outline" className="flex items-center gap-2 hover:bg-blue-50 hover:border-blue-300 transition-colors shadow-sm">
                    <Save className="w-4 h-4" /> Save / Generate Link
                  </Button>
                </div>
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