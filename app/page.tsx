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

const ReportTimelineCalculator = () => {
  // Project metadata
  const [projectName, setProjectName] = useState('');
  const [reportType, setReportType] = useState('Annual Report');
  const [timestamp, setTimestamp] = useState('');
  const [schedulingMode, setSchedulingMode] = useState('backward'); // backward default
  const [finalDate, setFinalDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [includeWeekends, setIncludeWeekends] = useState(false); // default exclude weekends
  const [holidays, setHolidays] = useState('');
  const [statutory, setStatutory] = useState(0);
  const [globalGoodwill, setGlobalGoodwill] = useState(0);

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
    contentDevelopment: 10,
    contentReview: 3,
    clientReview1: 3,
    clientReview2: 3,
    clientReview3: 3,
    finalReview: 2,
    goodwill: 0,
    review1Name: 'Content review 1',
    review2Name: 'Content review 2',
    review3Name: 'Content review 3',
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
    rev1Name: 'Revision 1',
    rev2Name: 'Revision 2',
    skipRev1: false,
    skipRev2: false,
    finalSubmissionAuto: true
  });

  // Publication design & layout
  const [design, setDesign] = useState({
    pages: 40,
    review1: 4,
    review2: 4,
    review3: 4,
    goodwill: 2,
    approval: 2,
    review1Name: 'Client review & amends 1',
    review2Name: 'Client review & amends 2',
    review3Name: 'Client review & amends 3',
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
    while (remaining > 0) {
      result.setDate(result.getDate() + direction);
      const day = result.getDay();
      const isWeekend = !includeWeekends && (day === 0 || day === 6);
      const iso: ISODateString = result.toISOString().split('T')[0];
      const isHoliday = holidayList.includes(iso);
      if (!isWeekend && !isHoliday) remaining--;
    }
    return result;
  };

  // Utility: simple date difference in calendar days inclusive
  const diffDaysInclusive = (start, end) => {
    if (!start || !end) return 0;
    const ms = 24 * 60 * 60 * 1000;
    return Math.round((end - start) / ms) + 1;
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
      { val: editorial.contentDevelopment, name: 'Content development days' },
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
  const calculateTimeline = () => {
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
      + editorial.contentDevelopment
      + editorial.contentReview
      + (!editorial.skipReview1 ? editorial.clientReview1 : 0)
      + (!editorial.skipReview2 ? editorial.clientReview2 : 0)
      + (!editorial.skipReview3 ? editorial.clientReview3 : 0)
      + editorial.finalReview
      + editorial.goodwill;

    const creativeDays = (creative.themeAvailable ? 0 : creative.themeDays)
      + creative.themeRev1
      + creative.themeRev2
      + creative.designDuration
      + creative.rev1Name ? 0 : 0; // placeholder to ensure available

    const designWorkDays = Math.max(1, Math.ceil(design.pages / 10));
    const designDays = designWorkDays
      + (!design.skipReview1 ? design.review1 : 0)
      + (!design.skipReview2 ? design.review2 : 0)
      + (!design.skipReview3 ? design.review3 : 0)
      + design.goodwill
      + design.approval;

    const webDays = webDeliverablesRequired ? (webDeliverables.uiuxDays + webDeliverables.deploymentDays) : 0;
    const printDays = print.preparation + print.printDeliveryDays;

    // Global goodwill applies to entire timeline. We'll add it as buffer before statutory or before final delivery.
    const totalInternalDays = editorialDays + creativeDays + designDays + webDays + printDays;
    const totalDays = totalInternalDays + globalGoodwill + statutory;

    if (totalDays > 365) setWarnings(['Total timeline exceeds 365 days. Consider revising durations']);

    // Build phases with forward or backward scheduling
    let phases: Phase[] = [];
    if (schedulingMode === 'backward') {
      const deadline = new Date(finalDate);
      // Apply statutory days after print. Global goodwill is applied before statutory but after print production.
      const statutoryEnd = new Date(deadline);
      const statutoryStart = addWorkingDays(statutoryEnd, -statutory, false);

      const goodwillEnd = statutoryStart;
      const goodwillStart = addWorkingDays(goodwillEnd, -globalGoodwill, false);

      const printEnd = goodwillStart;
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
      let cumulativeDays = editorial.dataCollection + editorial.contentDevelopment + editorial.contentReview;
      const editorialReviews = [];
      if (!editorial.skipReview1) {
        editorialReviews.push({ name: editorial.review1Name, date: addWorkingDays(editorialStart, cumulativeDays, true) });
        cumulativeDays += editorial.clientReview1;
      }
      if (!editorial.skipReview2) {
        editorialReviews.push({ name: editorial.review2Name, date: addWorkingDays(editorialStart, cumulativeDays, true) });
        cumulativeDays += editorial.clientReview2;
      }
      if (!editorial.skipReview3) {
        editorialReviews.push({ name: editorial.review3Name, date: addWorkingDays(editorialStart, cumulativeDays, true) });
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
      phases.push({ name: 'Global Goodwill Buffer', start: goodwillStart, end: goodwillEnd, days: globalGoodwill });
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

      const goodwillStart = addWorkingDays(printEnd, 1, true);
      const goodwillEnd = addWorkingDays(goodwillStart, globalGoodwill, true);

      const statutoryStart = addWorkingDays(goodwillEnd, 1, true);
      const statutoryEnd = addWorkingDays(statutoryStart, statutory, true);

      // Calculate review dates for editorial (forward scheduling)
      let cumulativeDaysForward = editorial.dataCollection + editorial.contentDevelopment + editorial.contentReview;
      const editorialReviewsForward = [];
      if (!editorial.skipReview1) {
        editorialReviewsForward.push({ name: editorial.review1Name, date: addWorkingDays(editorialStart, cumulativeDaysForward, true) });
        cumulativeDaysForward += editorial.clientReview1;
      }
      if (!editorial.skipReview2) {
        editorialReviewsForward.push({ name: editorial.review2Name, date: addWorkingDays(editorialStart, cumulativeDaysForward, true) });
        cumulativeDaysForward += editorial.clientReview2;
      }
      if (!editorial.skipReview3) {
        editorialReviewsForward.push({ name: editorial.review3Name, date: addWorkingDays(editorialStart, cumulativeDaysForward, true) });
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
      phases.push({ name: 'Global Goodwill Buffer', start: goodwillStart, end: goodwillEnd, days: globalGoodwill });
      phases.push({ name: 'Statutory Period', start: statutoryStart, end: statutoryEnd, days: statutory });
    }

    setTimeline({ phases, totalDays, totalInternalDays });
  };

  const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // copy summary text
  const exportToText = () => {
    if (!timeline) return;
    let text = `PROJECT: ${projectName}\nType: ${reportType}\nGenerated: ${new Date().toLocaleString()}\nMode: ${schedulingMode}\nTotal Duration: ${timeline.totalDays} days\n\n`;
    timeline.phases.forEach((p, i) => {
      text += `${i + 1}. ${p.name}\n  Start: ${formatDate(p.start)}\n  End:   ${formatDate(p.end)}\n  Days:  ${p.days}\n`;
      if (p.reviews) p.reviews.forEach(r => text += `    - ${r.name}: ${formatDate(r.date)}\n`);
      if (p.milestones) p.milestones.forEach(m => text += `    - ${m.name}: ${formatDate(m.date)}\n`);
      text += '\n';
    });
    navigator.clipboard.writeText(text);
    alert('Timeline copied to clipboard');
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

        <Card className="shadow">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
            <CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5" /> Project Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Project Title *</Label>
                <Input className={`mt-1 ${requiredClass(projectName)}`} value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="Enter project title" />
              </div>

              <div>
                <Label>Type of Report</Label>
                <Select value={reportType} onValueChange={(v) => setReportType(v)}>
                  <SelectTrigger className="mt-1">
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

              <div>
                <Label>Timestamp</Label>
                <Input className="mt-1" value={timestamp ? new Date(timestamp).toLocaleString() : ''} readOnly />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <Label>Scheduling Method</Label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={schedulingMode === 'backward'} onChange={() => setSchedulingMode('backward')} />
                    <span>Backward Scheduling (from final delivery)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={schedulingMode === 'forward'} onChange={() => setSchedulingMode('forward')} />
                    <span>Forward Scheduling (from start)</span>
                  </label>
                </div>
              </div>

              <div>
                <Label>{schedulingMode === 'backward' ? 'Final Delivery Date *' : 'Project Start Date *'}</Label>
                <Input className={`mt-1 ${requiredClass(schedulingMode === 'backward' ? finalDate : startDate)}`} type="date" value={schedulingMode === 'backward' ? finalDate : startDate} onChange={e => schedulingMode === 'backward' ? setFinalDate(e.target.value) : setStartDate(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div className="flex items-center gap-2">
                <Checkbox checked={includeWeekends} onCheckedChange={setIncludeWeekends} id="inclWeekends" />
                <Label htmlFor="inclWeekends">Include weekends in calculations</Label>
              </div>

              <div>
                <Label>Holidays (YYYY-MM-DD, comma separated)</Label>
                <Input className="mt-1" value={holidays} onChange={e => setHolidays(e.target.value)} placeholder="2025-12-25,2025-12-26" />
              </div>

              <div>
                <Label>Statutory Days (after production)</Label>
                <Input type="number" value={statutory} onChange={e => setStatutory(parseInt(e.target.value) || 0)} className="mt-1" min={0} />
              </div>

              <div>
                <Label>Global Goodwill Buffer (Days)</Label>
                <Input type="number" value={globalGoodwill} onChange={e => setGlobalGoodwill(parseInt(e.target.value) || 0)} className="mt-1" min={0} />
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

        <Card className="shadow">
          <CardHeader className="bg-gradient-to-r from-purple-600 to-purple-700 text-white cursor-pointer" onClick={() => toggleSection('editorial')}>
            <CardTitle className="flex items-center justify-between">
              <span>Editorial & Content Development</span>
              {expandedSections.editorial ? <ChevronUp /> : <ChevronDown />}
            </CardTitle>
          </CardHeader>
          {expandedSections.editorial && (
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Data Collection and Interviews (Days)</Label>
                  <Input type="number" value={editorial.dataCollection} onChange={e => setEditorial({ ...editorial, dataCollection: parseInt(e.target.value) || 0 })} min={0} />
                </div>

                <div>
                  <Label>Content Development (Days)</Label>
                  <Input type="number" value={editorial.contentDevelopment} onChange={e => setEditorial({ ...editorial, contentDevelopment: parseInt(e.target.value) || 0 })} min={0} />
                </div>

                <div>
                  <Label>Content Review / Sub-editing (Days)</Label>
                  <Input type="number" value={editorial.contentReview} onChange={e => setEditorial({ ...editorial, contentReview: parseInt(e.target.value) || 0 })} min={0} />
                </div>

                <div className="md:col-span-3">
                  <Label className="text-base font-semibold">Client Review and Feedback</Label>
                </div>

                <div>
                  <Label>{editorial.review1Name}</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <Checkbox checked={editorial.skipReview1} onCheckedChange={(v) => setEditorial({ ...editorial, skipReview1: v })} />
                    <Label>Skip</Label>
                    <Input type="number" value={editorial.clientReview1} onChange={e => setEditorial({ ...editorial, clientReview1: parseInt(e.target.value) || 0 })} className="w-20" placeholder="Days" />
                  </div>
                </div>

                <div>
                  <Label>{editorial.review2Name}</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <Checkbox checked={editorial.skipReview2} onCheckedChange={(v) => setEditorial({ ...editorial, skipReview2: v })} />
                    <Label>Skip</Label>
                    <Input type="number" value={editorial.clientReview2} onChange={e => setEditorial({ ...editorial, clientReview2: parseInt(e.target.value) || 0 })} className="w-20" placeholder="Days" />
                  </div>
                </div>

                <div>
                  <Label>{editorial.review3Name}</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <Checkbox checked={editorial.skipReview3} onCheckedChange={(v) => setEditorial({ ...editorial, skipReview3: v })} />
                    <Label>Skip</Label>
                    <Input type="number" value={editorial.clientReview3} onChange={e => setEditorial({ ...editorial, clientReview3: parseInt(e.target.value) || 0 })} className="w-20" placeholder="Days" />
                  </div>
                </div>

                <div>
                  <Label>Final Review & Submission (Days)</Label>
                  <Input type="number" value={editorial.finalReview} onChange={e => setEditorial({ ...editorial, finalReview: parseInt(e.target.value) || 0 })} min={0} />
                </div>

                <div>
                  <Label>Goodwill Days (for this phase)</Label>
                  <Input type="number" value={editorial.goodwill} onChange={e => setEditorial({ ...editorial, goodwill: parseInt(e.target.value) || 0 })} min={0} />
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        <Card className="shadow">
          <CardHeader className="bg-gradient-to-r from-green-600 to-green-700 text-white cursor-pointer" onClick={() => toggleSection('creative')}>
            <CardTitle className="flex items-center justify-between">
              <span>Creative Development</span>
              {expandedSections.creative ? <ChevronUp /> : <ChevronDown />}
            </CardTitle>
          </CardHeader>
          {expandedSections.creative && (
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-3 flex items-center gap-2">
                  <Checkbox checked={creative.themeAvailable} onCheckedChange={(v) => setCreative({ ...creative, themeAvailable: v })} />
                  <Label>Theme available. Uncheck to enable theme development ({creative.themeDays} days)</Label>
                </div>

                {!creative.themeAvailable && (
                  <>
                    <div>
                      <Label>Theme Development Days</Label>
                      <Input type="number" value={creative.themeDays} onChange={e => setCreative({ ...creative, themeDays: parseInt(e.target.value) || 0 })} min={0} />
                    </div>
                    <div>
                      <Label>Theme Revision 1 (Days)</Label>
                      <Input type="number" value={creative.themeRev1} onChange={e => setCreative({ ...creative, themeRev1: parseInt(e.target.value) || 0 })} min={0} />
                    </div>
                    <div>
                      <Label>Theme Revision 2 (Days)</Label>
                      <Input type="number" value={creative.themeRev2} onChange={e => setCreative({ ...creative, themeRev2: parseInt(e.target.value) || 0 })} min={0} />
                    </div>
                  </>
                )}

                <div>
                  <Label>Creative Design Duration (Days)</Label>
                  <Input type="number" value={creative.designDuration} onChange={e => setCreative({ ...creative, designDuration: parseInt(e.target.value) || 0 })} min={0} />
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        <Card className="shadow">
          <CardHeader className="bg-gradient-to-r from-orange-600 to-orange-700 text-white cursor-pointer" onClick={() => toggleSection('design')}>
            <CardTitle className="flex items-center justify-between">
              <span>Publication Design & Layout</span>
              {expandedSections.design ? <ChevronUp /> : <ChevronDown />}
            </CardTitle>
          </CardHeader>
          {expandedSections.design && (
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Number of Pages (10 pages/day)</Label>
                  <Input type="number" value={design.pages} onChange={e => setDesign({ ...design, pages: parseInt(e.target.value) || 0 })} min={1} />
                  <p className="text-sm mt-1">Estimated work days: {Math.max(1, Math.ceil(design.pages / 10))} days</p>
                </div>

                <div>
                  <Label>Review 1 Name</Label>
                  <Input value={design.review1Name} onChange={e => setDesign({ ...design, review1Name: e.target.value })} />
                  <div className="flex items-center gap-2 mt-2">
                    <Checkbox checked={design.skipReview1} onCheckedChange={(v) => setDesign({ ...design, skipReview1: v })} />
                    <Label>Skip</Label>
                    <Input type="number" value={design.review1} onChange={e => setDesign({ ...design, review1: parseInt(e.target.value) || 0 })} className="w-20" />
                  </div>
                </div>

                <div>
                  <Label>Review 2 Name</Label>
                  <Input value={design.review2Name} onChange={e => setDesign({ ...design, review2Name: e.target.value })} />
                  <div className="flex items-center gap-2 mt-2">
                    <Checkbox checked={design.skipReview2} onCheckedChange={(v) => setDesign({ ...design, skipReview2: v })} />
                    <Label>Skip</Label>
                    <Input type="number" value={design.review2} onChange={e => setDesign({ ...design, review2: parseInt(e.target.value) || 0 })} className="w-20" />
                  </div>
                </div>

                <div>
                  <Label>Review 3 Name</Label>
                  <Input value={design.review3Name} onChange={e => setDesign({ ...design, review3Name: e.target.value })} />
                  <div className="flex items-center gap-2 mt-2">
                    <Checkbox checked={design.skipReview3} onCheckedChange={(v) => setDesign({ ...design, skipReview3: v })} />
                    <Label>Skip</Label>
                    <Input type="number" value={design.review3} onChange={e => setDesign({ ...design, review3: parseInt(e.target.value) || 0 })} className="w-20" />
                  </div>
                </div>

                <div>
                  <Label>Goodwill Days</Label>
                  <Input type="number" value={design.goodwill} onChange={e => setDesign({ ...design, goodwill: parseInt(e.target.value) || 0 })} min={0} />
                </div>

                <div>
                  <Label>Approval Days</Label>
                  <Input type="number" value={design.approval} onChange={e => setDesign({ ...design, approval: parseInt(e.target.value) || 0 })} min={0} />
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        <Card className="shadow">
          <CardHeader className="bg-gradient-to-r from-teal-600 to-teal-700 text-white cursor-pointer" onClick={() => toggleSection('web')}>
            <CardTitle className="flex items-center justify-between">
              <span>Optional Web Version Development</span>
              {expandedSections.web ? <ChevronUp /> : <ChevronDown />}
            </CardTitle>
          </CardHeader>
          {expandedSections.web && (
            <CardContent>
              <div className="flex items-center gap-2 mb-4">
                <Checkbox checked={webDeliverablesRequired} onCheckedChange={setWebDeliverablesRequired} />
                <Label>Web Deliverables Required</Label>
              </div>

              {webDeliverablesRequired && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>UI & UX Development (Days)</Label>
                    <Input type="number" value={webDeliverables.uiuxDays} onChange={e => setWebDeliverables({ ...webDeliverables, uiuxDays: parseInt(e.target.value) || 0 })} min={0} />
                  </div>
                  <div>
                    <Label>Deployment (Days)</Label>
                    <Input type="number" value={webDeliverables.deploymentDays} onChange={e => setWebDeliverables({ ...webDeliverables, deploymentDays: parseInt(e.target.value) || 0 })} min={0} />
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        <Card className="shadow">
          <CardHeader className="bg-gradient-to-r from-red-600 to-red-700 text-white cursor-pointer" onClick={() => toggleSection('print')}>
            <CardTitle className="flex items-center justify-between">
              <span>Print Production (Preparation of files to go to print)</span>
              {expandedSections.print ? <ChevronUp /> : <ChevronDown />}
            </CardTitle>
          </CardHeader>
          {expandedSections.print && (
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Preparation & Submission (Days)</Label>
                  <Input type="number" value={print.preparation} onChange={e => setPrint({ ...print, preparation: parseInt(e.target.value) || 0 })} min={0} />
                </div>

                <div>
                  <Label>Print Delivery (Days)</Label>
                  <Input type="number" value={print.printDeliveryDays} onChange={e => setPrint({ ...print, printDeliveryDays: parseInt(e.target.value) || 0 })} min={0} />
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
          <Card className="shadow border-2 border-blue-200">
            <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
              <CardTitle className="text-2xl">Project Plan and Deliverables</CardTitle>
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
                    'Global Goodwill Buffer': 'Global Goodwill Buffer',
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
                <Button onClick={() => alert('Integrate jsPDF for PDF export')} variant="outline" className="flex items-center gap-2">
                  <Download className="w-4 h-4" /> Export PDF
                </Button>
                <Button onClick={() => alert('Integrate SheetJS for Excel export')} variant="outline" className="flex items-center gap-2">
                  <Download className="w-4 h-4" /> Export Excel
                </Button>
                <Button onClick={() => alert('Implement shareable link generation server-side')} variant="outline" className="flex items-center gap-2">
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