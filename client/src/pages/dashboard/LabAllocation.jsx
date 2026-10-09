import { useState, useEffect } from "react";
import { 
  FlaskConical, Cpu, Users, Clock, Calendar, CheckCircle2, 
  AlertCircle, RefreshCw, LayoutGrid, Database, Play, TableProperties,
  Plus, Save, GraduationCap, X, User, Upload, FileText,
  Table2, ClipboardList, BookOpen, ChevronDown, FileSpreadsheet, File
} from "lucide-react";

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const SLOTS_MAP = {
  'Monday': { m1: 'MON_M1', m2: 'MON_M2', a1: 'MON_A1', a2: 'MON_A2' },
  'Tuesday': { m1: 'TUE_M1', m2: 'TUE_M2', a1: 'TUE_A1', a2: 'TUE_A2' },
  'Wednesday': { m1: 'WED_M1', m2: 'WED_M2', a1: 'WED_A1', a2: 'WED_A2' },
  'Thursday': { m1: 'THU_M1', m2: 'THU_M2', a1: 'THU_A1', a2: 'THU_A2' },
  'Friday': { m1: 'FRI_M1', m2: 'FRI_M2', a1: 'FRI_A1', a2: 'FRI_A2' }
};

const TABS = [
  { key: "data", label: "Data Sources", icon: Database },
  { key: "preview", label: "Preview", icon: Table2 },
  { key: "run", label: "Run", icon: Cpu },
  { key: "results", label: "Results", icon: ClipboardList },
  { key: "algorithm", label: "Algorithm", icon: BookOpen },
];

const LabAllocation = () => {
  const [activeTab, setActiveTab] = useState('data');
  const [data, setData] = useState({ labs: [], courses: [], slots: [] });
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [coursesUploaded, setCoursesUploaded] = useState(false);
  const [labsUploaded, setLabsUploaded] = useState(false);

  // Modals for adding data
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [showAddLab, setShowAddLab] = useState(false);
  
  const [newCourse, setNewCourse] = useState({ code: '', name: '', student_count: '', gpu_required: false, academic_year: '', instructor: '', duration: 3 });
  const [newLab, setNewLab] = useState({ name: '', capacity: '', has_gpu: false });

  // PDF Upload states
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingTimetable, setIsUploadingTimetable] = useState(false);
  const [timetableData, setTimetableData] = useState(null);
  
  const [extractedCourses, setExtractedCourses] = useState([]);
  const [showExtractedReview, setShowExtractedReview] = useState(false);

  // Fetch initial data
  useEffect(() => {
    fetch('/api/optimization/data')
      .then(res => res.json())
      .then(d => {
        if (d.data && (d.data.labs.length > 0 || d.data.courses.length > 0)) setData(d.data);
        if (d.timetableData) setTimetableData(d.timetableData);
      })
      .catch(e => console.error(e));
  }, []);
  
  // Auto-save to DB when data or timetableData changes
  useEffect(() => {
    // Only save if there's actually something to save, and skip initial empty renders
    if (data.labs.length === 0 && data.courses.length === 0 && !timetableData) return;
    
    fetch('/api/optimization/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labs: data.labs, courses: data.courses, timetableData })
    }).catch(e => console.error("Auto-save failed", e));
  }, [data, timetableData]);


  const handleRunOptimization = async () => {
    setLoading(true);
    setError(null);
    setActiveTab('results');
    try {
      const response = await fetch('/api/optimization/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, timetableData })
      });
      if (!response.ok) throw new Error("Failed to fetch allocations");
      const result = await response.json();
      
      if (result.status === "SUCCESS") {
        setAllocations(result.allocations);
        setLastUpdated(new Date().toLocaleTimeString());
      } else {
        setError(result.message || "Optimization failed: Infeasible constraints.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCourse = (e) => {
    e.preventDefault();
    if (!newCourse.code || !newCourse.academic_year || !newCourse.student_count || !newCourse.instructor) {
      alert("Please fill all required course details!");
      return;
    }
    setData({
      ...data,
      courses: [...(data?.courses || []), { ...newCourse, student_count: parseInt(newCourse.student_count), duration: parseInt(newCourse.duration) }]
    });
    setShowAddCourse(false);
    setNewCourse({ code: '', name: '', student_count: '', gpu_required: false, academic_year: '', instructor: '', duration: 3 });
  };

  const handleAddLab = (e) => {
    e.preventDefault();
    if (!newLab.name || !newLab.capacity) {
      alert("Please fill all required lab details!");
      return;
    }
    const id = Math.max(...(data?.labs || []).map(l => l.id), 0) + 1;
    setData({
      ...data,
      labs: [...(data?.labs || []), { ...newLab, id, capacity: parseInt(newLab.capacity) }]
    });
    setShowAddLab(false);
    setNewLab({ name: '', capacity: '', has_gpu: false });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/optimization/parse-pdf', {
        method: 'POST',
        body: formData
      });
      const result = await response.json();
      
      if (response.ok && result.courses) {
        // Prepare courses with missing manual fields
        const coursesWithEmptyFields = result.courses.map(c => ({
          ...c,
          student_count: '',
          academic_year: '1st Year',
          gpu_required: false,
          id: Math.random().toString(36).substr(2, 9)
        }));
        setExtractedCourses(coursesWithEmptyFields);
        setShowExtractedReview(true);
      } else {
        alert("Failed to parse PDF: " + (result.error || "Unknown error"));
      }
    } catch (err) {
      alert("Upload failed: " + err.message);
    } finally {
      setIsUploading(false);
      e.target.value = null; // reset file input
    }
  };

  const handleTimetableUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploadingTimetable(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch('/api/optimization/parse-timetable-pdf', { method: 'POST', body: formData });
      const result = await response.json();
      if (response.ok && result.slots) {
        setTimetableData(result);
        alert("Timetable extracted successfully!");
      } else {
        alert("Failed to parse Timetable PDF: " + (result.error || "Unknown error"));
      }
    } catch (err) {
      alert("Upload failed: " + err.message);
    } finally {
      setIsUploadingTimetable(false);
      e.target.value = null;
    }
  };

  const handleCsvUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split('\n');
      const newLabs = [];
      
      // assuming header is first line
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(',');
        if (parts.length >= 4) {
           const id = parts[0];
           const name = parts[1];
           const capacity = parts[2];
           const hasGpu = parts[3];
           newLabs.push({
             id: parseInt(id) || i,
             name: name.trim(),
             capacity: parseInt(capacity) || 0,
             has_gpu: hasGpu.trim().toLowerCase() === 'true'
           });
        }
      }
      
      setData(prev => ({ ...prev, labs: newLabs }));
      setLabsUploaded(true);
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  const handleUpdateExtractedCourse = (id, field, value) => {
    setExtractedCourses(prev => 
      prev.map(c => c.id === id ? { ...c, [field]: value } : c)
    );
  };

  const handleAddExtractedCourses = () => {
    // Validate
    const invalid = extractedCourses.find(c => !c.student_count || !c.academic_year);
    if (invalid) {
      alert("Please fill student strength and year for all extracted courses!");
      return;
    }
    
    
    const readyToAdd = extractedCourses.map(({ id, ...rest }) => {
      let periods = [];
      let unmapped_slots = [];
      if (timetableData && rest.lab_slot) {
        let fullSlotStr = rest.lab_slot.split('/')[0].trim();
        let slotParts = fullSlotStr.split(/&|,/);
        
        slotParts.forEach(part => {
           part = part.trim();
           if (!part) return;
           
           let letters = part.match(/[A-Z]+/)?.[0] || '';
           let numbers = part.match(/[0-9]+/)?.[0] || '';
           
           for (let i = 0; i < letters.length; i++) {
              let baseLetter = letters[i];
              if (timetableData.slots[baseLetter]) {
                 const day = timetableData.slots[baseLetter].day;
                 const tPeriods = timetableData.slots[baseLetter].periods;
                 
                 if (!numbers) {
                    tPeriods.forEach(t => periods.push(day + '_' + t));
                 } else {
                    for (let j = 0; j < numbers.length; j++) {
                       let idx = parseInt(numbers[j]) - 1;
                       if (idx >= 0 && idx < tPeriods.length) {
                          periods.push(day + '_' + tPeriods[idx]);
                       }
                    }
                 }
              } else {
                 unmapped_slots.push(baseLetter);
              }
           }
        });
        periods = [...new Set(periods)];
      }
      return {
        ...rest,
        student_count: parseInt(rest.student_count),
        duration: parseInt(rest.duration) || (periods.length > 0 ? periods.length : 3),
        periods: periods,
        _unmapped: unmapped_slots
      };
    });
    
    // Validate if any course couldn't map its slots
    const unmappedCourse = readyToAdd.find(c => c.periods.length === 0);
    if (unmappedCourse) {
       alert(`Error: Course ${unmappedCourse.code} has lab slot "${unmappedCourse.lab_slot}", but the letters [${unmappedCourse._unmapped.join(',')}] were not found in the uploaded timetable PDF. Please check the timetable PDF or edit the course slot.`);
       return;
    }
    
    // Clean up temp field
    readyToAdd.forEach(c => delete c._unmapped);
    
    // OVERWRITE existing courses as requested by user
    setData({
      ...data,
      courses: readyToAdd
    });
    setCoursesUploaded(true);
    
    setShowExtractedReview(false);
    setExtractedCourses([]);
  };





  return (
    <div className="mx-auto w-full max-w-[1920px] space-y-6 p-4 md:p-6 lg:p-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <FlaskConical size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                Lab Allocation
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Upload the inputs, run the solver, and assign labs without timetable clashes.
              </p>
            </div>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            <RefreshCw size={15} /> Refresh
          </button>
        </div>

        <nav className="-mx-1 mt-5 overflow-x-auto pb-1">
          <div className="flex min-w-max gap-1.5 rounded-xl bg-slate-100 p-1.5">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${
                  activeTab === key ? "bg-white text-indigo-700 shadow-sm"
                              : "text-slate-500 hover:text-slate-700"}`}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      {/* Tab: Data Source */}
      {activeTab === 'data' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <section>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
              PDF SOURCES
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Courses PDF Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col">
                <div className="flex items-start gap-3 mb-3">
                  <div className="bg-indigo-50 text-indigo-500 p-2 rounded-lg">
                    <File className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                       <h3 className="font-bold text-slate-800 text-sm">List of Courses</h3>
                       <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full">{data?.courses?.length || 0} rows</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      The department course list PDF. Only CSE-owned courses are stored: the discipline must name CSE/CS&DS and the code must be in the CS*/DS* series.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-5 mt-2">
                   {["course code", "course name", "discipline", "program", "lecture slot", "tutorial slot", "lab slot", "instructors"].map(tag => (
                      <span key={tag} className="text-[10px] border border-slate-200 text-slate-500 px-2 py-0.5 rounded-md bg-white">{tag}</span>
                   ))}
                </div>
                <div className="mt-auto">
                  {coursesUploaded ? (
                    <div className="flex flex-col gap-2">
                      <div className="w-full flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 py-2 rounded-lg text-sm font-bold border border-emerald-200">
                        <CheckCircle2 className="w-5 h-5" /> Data uploaded successfully
                      </div>
                      <label className={`w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${!timetableData ? 'opacity-50 cursor-not-allowed hover:bg-slate-100' : ''}`}>
                        {isUploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} 
                        {isUploading ? "Uploading..." : "Upload New PDF"}
                        <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} disabled={isUploading || !timetableData} />
                      </label>
                    </div>
                  ) : (
                    <label className={`w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${!timetableData ? 'opacity-50 cursor-not-allowed hover:bg-indigo-600' : ''}`}>
                      {isUploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} 
                      {isUploading ? "Uploading..." : "Upload .pdf"}
                      <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} disabled={isUploading || !timetableData} />
                    </label>
                  )}
                </div>
              </div>

              {/* Timetable PDF Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col">
                <div className="flex items-start gap-3 mb-3">
                  <div className="bg-indigo-50 text-indigo-500 p-2 rounded-lg">
                    <File className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                       <h3 className="font-bold text-slate-800 text-sm">Common Timetable</h3>
                       <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full">{timetableData ? 'Parsed' : '0 rows'}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      The institute slot grid. Parsed into 5 days x 8 periods, recording which theory slot (A-M) and which 180-minute lab slot (N-W) occupies each cell.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-5 mt-2">
                   {["day", "start time", "end time", "theory slot", "lab slot"].map(tag => (
                      <span key={tag} className="text-[10px] border border-slate-200 text-slate-500 px-2 py-0.5 rounded-md bg-white">{tag}</span>
                   ))}
                </div>
                <div className="mt-auto">
                  {timetableData ? (
                    <div className="flex flex-col gap-2">
                      <div className="w-full flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 py-2 rounded-lg text-sm font-bold border border-emerald-200">
                        <CheckCircle2 className="w-5 h-5" /> Data uploaded successfully
                      </div>
                      <label className={`w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer`}>
                        {isUploadingTimetable ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {isUploadingTimetable ? "Uploading..." : "Upload New PDF"}
                        <input type="file" accept="application/pdf" className="hidden" onChange={handleTimetableUpload} disabled={isUploadingTimetable} />
                      </label>
                    </div>
                  ) : (
                    <label className={`w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer`}>
                      {isUploadingTimetable ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      {isUploadingTimetable ? "Uploading..." : "Upload .pdf"}
                      <input type="file" accept="application/pdf" className="hidden" onChange={handleTimetableUpload} disabled={isUploadingTimetable} />
                    </label>
                  )}
                </div>
              </div>

            </div>
          </section>

          {!timetableData && (
             <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800 flex items-start gap-3">
               <AlertCircle className="h-5 w-5 shrink-0 text-blue-500" />
               <div>
                  <span className="font-bold">Required:</span> Please upload the Common Timetable PDF first so the system can extract exact slots and timings automatically.
               </div>
             </div>
          )}
          
          <section>
             <h2 className="mb-3 mt-6 text-xs font-bold uppercase tracking-wider text-slate-500">
               CSV SOURCES
             </h2>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
               
               {/* Labs CSV Card */}
               <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col">
                 <div className="flex items-start gap-3 mb-3">
                   <div className="bg-emerald-50 text-emerald-500 p-2 rounded-lg">
                     <FileSpreadsheet className="w-5 h-5" />
                   </div>
                   <div className="flex-1">
                     <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-800 text-sm">Lab Details</h3>
                        <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full">{data?.labs?.length || 0} rows</span>
                     </div>
                     <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                       Upload a .csv with the exact header shown below. The file replaces the whole table.
                     </p>
                   </div>
                 </div>
                 
                 <div className="mt-4 mb-5 border border-slate-200 rounded-lg overflow-hidden">
                    <button className="w-full flex items-center justify-between p-2.5 bg-slate-50 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors">
                       REQUIRED CSV FORMAT
                       <ChevronDown className="w-4 h-4 text-slate-400" />
                    </button>
                 </div>

                 <div className="mt-auto">
                   {labsUploaded ? (
                    <div className="w-full flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 py-2.5 rounded-lg text-sm font-bold border border-emerald-200">
                      <CheckCircle2 className="w-5 h-5" /> Data uploaded successfully
                    </div>
                   ) : (
                    <label className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer">
                      <Upload className="w-4 h-4" /> Upload .csv
                      <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
                    </label>
                   )}
                 </div>
               </div>

             </div>
          </section>

        </div>
      )}

      {/* Tab: Preview */}
      {activeTab === 'preview' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Manual Entry Controls */}
          <div className="flex flex-wrap gap-4 mb-6">
            <button onClick={() => setShowAddCourse(true)} className="flex items-center gap-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-5 py-2.5 rounded-xl font-semibold transition-colors border border-indigo-100 shadow-sm">
              <Plus className="h-5 w-5" /> Add Course
            </button>
            <button onClick={() => setShowAddLab(true)} className="flex items-center gap-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-5 py-2.5 rounded-xl font-semibold transition-colors border border-emerald-100 shadow-sm">
              <Plus className="h-5 w-5" /> Add Lab
            </button>
          </div>
          
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Courses Section */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 xl:col-span-2 overflow-hidden">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Users className="h-6 w-6 text-indigo-500" /> Course Requirements
                </h3>
              </div>
              <div className="overflow-x-auto border border-slate-100 rounded-xl">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
                    <tr>
                      <th className="p-4">Course</th>
                      <th className="p-4">Year</th>
                      <th className="p-4">Strength</th>
                      <th className="p-4">Duration (Hrs)</th>
                      <th className="p-4">Instructor</th>
                      <th className="p-4">Hardware Req.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {(data?.courses || []).map(course => (
                      <tr key={course.code} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4">
                          <div className="font-bold text-indigo-600">{course.code}</div>
                          {course.name && <div className="text-xs text-slate-500 font-medium truncate max-w-[150px] mt-0.5">{course.name}</div>}
                        </td>
                        <td className="p-4 text-slate-700"><div className="flex items-center gap-2"><GraduationCap className="h-4 w-4 text-slate-400"/> {course.academic_year}</div></td>
                        <td className="p-4 text-slate-600">{course.student_count}</td>
                        <td className="p-4 text-slate-600">{course.duration} Hours</td>
                        <td className="p-4 font-medium text-slate-700"><div className="flex items-center gap-2"><User className="h-4 w-4 text-slate-400"/> {course.instructor}</div></td>
                        <td className="p-4">
                          {course.gpu_required ? <span className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center w-fit gap-1"><Cpu className="h-3.5 w-3.5"/> GPU</span> : <span className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-semibold w-fit">Standard</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Labs Section */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 xl:col-span-2 overflow-hidden">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <LayoutGrid className="h-6 w-6 text-indigo-500" /> Physical Labs Inventory
                </h3>
              </div>
              <div className="overflow-x-auto border border-slate-100 rounded-xl">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
                    <tr>
                      <th className="p-4">Lab Name</th>
                      <th className="p-4">Capacity</th>
                      <th className="p-4">Hardware Profile</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {(data?.labs || []).map(lab => (
                      <tr key={lab.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 font-medium text-slate-700 text-base">{lab.name}</td>
                        <td className="p-4 text-slate-600 text-base">{lab.capacity} Seats</td>
                        <td className="p-4">
                          {lab.has_gpu ? <span className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center w-fit gap-1.5"><Cpu className="h-4 w-4"/> GPU Equipped</span> : <span className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-semibold w-fit">Standard Workstations</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Run */}
      {activeTab === 'run' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl p-16 shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
            <Cpu className="h-16 w-16 text-indigo-200 mb-6" />
            <h2 className="text-2xl font-black text-slate-800 mb-3">Ready to Optimize?</h2>
            <p className="text-slate-500 max-w-lg mb-8">
              The constraint satisfaction engine will evaluate thousands of potential schedules to find a perfect, conflict-free allocation of physical labs.
            </p>
            <button onClick={handleRunOptimization} className="flex items-center gap-3 bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-4 rounded-xl font-bold text-lg transition-all shadow-sm shadow-indigo-200">
              <Play className="h-6 w-6 fill-current" /> Run Algorithm Now
            </button>
          </div>
        </div>
      )}

      {/* Tab: Results */}
      {activeTab === 'results' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {loading && (
            <div className="bg-white rounded-3xl p-20 shadow-sm border border-slate-100 flex flex-col items-center justify-center space-y-6">
              <RefreshCw className="h-16 w-16 text-indigo-500 animate-spin" />
              <p className="text-slate-500 text-xl font-medium">Running Constraint Satisfaction Solver...</p>
              <p className="text-slate-400 text-sm max-w-md text-center">Optimizing over thousands of possible permutations while guaranteeing zero collisions between batches, instructors, and lab capacities.</p>
            </div>
          )}

          {error && !loading && (
            <div className="bg-rose-50 border-2 border-rose-200 p-8 rounded-2xl flex gap-5 text-rose-700 items-start">
              <AlertCircle className="h-10 w-10 shrink-0" />
              <div>
                <h3 className="font-black text-2xl">Optimization Failed</h3>
                <p className="mt-2 text-rose-600 text-lg">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && allocations.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-black text-slate-800 text-2xl">Generated Institute Schedule</h3>
                <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" /> 100% Conflict-Free
                </span>
              </div>
              
              <div className="overflow-x-auto">
                {(() => {
                  const timeSlots = timetableData ? timetableData.headers.filter(h => h && (h.includes('-') || h.includes(':'))) : [];
                  // Helper to parse "HH:MM" (12-hour or 24-hour loosely) to minutes from midnight
                  const parseTimeStr = (tStr) => {
                     let [h, m] = tStr.split(':').map(Number);
                     if (h < 8) h += 12; // assume anything before 8 is PM (e.g. 1:25 -> 13:25)
                     return h * 60 + m;
                  };

                  let enrichedSlots = [];
                  for (let i = 0; i < timeSlots.length; i++) {
                     enrichedSlots.push({ type: 'slot', label: timeSlots[i], origIndex: i });
                     if (i < timeSlots.length - 1) {
                        const currentEnd = timeSlots[i].split('-')[1];
                        const nextStart = timeSlots[i+1].split('-')[0];
                        if (currentEnd && nextStart) {
                           const endMins = parseTimeStr(currentEnd);
                           const startMins = parseTimeStr(nextStart);
                           if (startMins - endMins > 30) {
                              enrichedSlots.push({ type: 'lunch', label: 'LUNCH BREAK' });
                           }
                        }
                     }
                  }

                  
                  return (
                    <table className="w-full text-center border-collapse min-w-[2500px]">
                      <thead>
                        <tr className="bg-[#1e3a5f] text-white">
                          <th className="p-4 border-r border-[#2a4b7c] w-32 font-black text-xl">Day</th>
                          <th className="p-0">
                             <div className="grid h-full w-full" style={{ gridTemplateColumns: enrichedSlots.map(s => s.type === 'lunch' ? '40px' : 'minmax(0, 1fr)').join(' ') }}>
                               {enrichedSlots.map((slot, idx) => (
                                 slot.type === 'lunch' ? 
                                 <div key={'lunch'+idx} className="bg-slate-700/50 py-4 font-black text-[10px] text-center border-r border-[#2a4b7c] [writing-mode:vertical-lr] rotate-180 tracking-widest text-slate-300 flex items-center justify-center">LUNCH</div>
                                 :
                                 <div key={slot.label} className="p-4 font-bold text-sm text-center border-r border-[#2a4b7c] last:border-0">{slot.label}</div>
                               ))}
                             </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {DAYS.map(day => (
                          <tr key={day} className="border-b border-slate-200 hover:bg-slate-50 transition-colors group">
                            <td className="p-4 border-r border-slate-200 font-black text-slate-700 bg-slate-50 group-hover:bg-slate-100 text-lg align-top">
                              {day}
                            </td>
                            <td className="p-0 align-top">
                              <div className="grid min-h-[120px] grid-flow-row-dense w-full relative z-10" style={{ gridTemplateColumns: enrichedSlots.map(s => s.type === 'lunch' ? '40px' : 'minmax(0, 1fr)').join(' ') }}>
                                 {/* Draw background columns */}
                                 {enrichedSlots.map((s, i) => (
                                    <div key={'bg'+i} className={`border-r border-slate-100/50 ${s.type === 'lunch' ? 'bg-slate-100/50' : ''}`} style={{ gridRow: '1 / -1', gridColumn: `${i+1} / span 1` }} />
                                 ))}
                                 
                                 {allocations
                                   .filter(alloc => alloc.periods && alloc.periods.some(p => p.startsWith(day)))
                                   .map((alloc, idx) => {
                                      const dayPeriods = alloc.periods.filter(p => p.startsWith(day));
                                      const allocTimes = dayPeriods.map(p => p.split('_')[1]);
                                      
                                      // Sort the allocTimes based on their position in enrichedSlots to prevent negative grid spans
                                      allocTimes.sort((a, b) => {
                                        return enrichedSlots.findIndex(s => s.label === a) - enrichedSlots.findIndex(s => s.label === b);
                                      });
                                      
                                      const enrichedStartIndex = enrichedSlots.findIndex(s => s.label === allocTimes[0]);
                                      const enrichedEndIndex = enrichedSlots.findIndex(s => s.label === allocTimes[allocTimes.length - 1]);
                                      
                                      if (enrichedStartIndex === -1 || enrichedEndIndex === -1) return null;
                                      
                                      const enrichedSpan = enrichedEndIndex - enrichedStartIndex + 1;
                                      
                                      const startTimeStr = allocTimes[0].split('-')[0];
                                      const endTimeParts = allocTimes[allocTimes.length - 1].split('-');
                                      const endTimeStr = endTimeParts.length > 1 ? endTimeParts[1] : endTimeParts[0];
                                      
                                      return (
                                        <div key={idx} 
                                             className="bg-white border-2 border-indigo-100 rounded-xl p-3 text-left shadow-sm hover:border-indigo-300 transition-colors m-2 z-20"
                                             style={{ gridColumn: `${enrichedStartIndex + 1} / span ${enrichedSpan}`, gridRow: 'auto' }}
                                        >
                                          <div className="flex justify-between items-center mb-1">
                                            <div className="font-black text-indigo-700 text-base">{alloc.course}</div>
                                            <span className="text-[10px] px-2 py-0.5 rounded font-bold border bg-indigo-100 text-indigo-700 border-indigo-200">
                                                {alloc.duration} HOUR LAB
                                            </span>
                                          </div>
                                          <div className="text-xs text-slate-500 font-bold flex items-center gap-1.5 mb-2 mt-1 bg-slate-50/80 w-max px-2 py-1 rounded-md border border-slate-100">
                                             <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                                             {startTimeStr} - {endTimeStr}
                                          </div>
                                          {alloc.name && <div className="text-xs font-semibold text-indigo-500 mb-1 truncate" title={alloc.name}>{alloc.name}</div>}
                                          {alloc.year && <div className="text-[10px] font-bold text-slate-500 mb-1 uppercase">{alloc.year}</div>}
                                          {alloc.instructor && <div className="text-xs text-slate-700 font-medium flex items-center gap-1 mb-1 truncate"><User className="h-3 w-3 text-slate-400 shrink-0" /> {alloc.instructor}</div>}
                                          <div className="text-xs text-slate-600 mt-2 pt-2 border-t flex items-center gap-1.5"><LayoutGrid className="h-3 w-3 text-slate-400 shrink-0" />{alloc.lab}</div>
                                        </div>
                                      );
                                 })}
                                 {allocations.filter(alloc => alloc.periods && alloc.periods.some(p => p.startsWith(day))).length === 0 && (
                                    <div className="text-slate-300 font-medium italic py-4 text-center text-sm" style={{ gridColumn: `1 / -1` }}>No labs scheduled</div>
                                 )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </div>
          )}

          {!loading && !error && allocations.length === 0 && (
             <div className="flex flex-col items-center justify-center h-96 bg-white rounded-3xl border border-slate-100 shadow-sm border-dashed">
             <Calendar className="h-20 w-20 text-slate-200 mb-6" />
             <p className="text-slate-500 text-xl font-bold">No schedule generated yet.</p>
             <button onClick={() => setActiveTab('run')} className="mt-6 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold text-lg transition-all shadow-sm">
                <Play className="h-5 w-5 fill-current" /> Go to Run Tab
              </button>
           </div>
          )}
        </div>
      )}
      {/* Tab: Algorithm */}
      {activeTab === 'algorithm' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 overflow-hidden">
             <div className="flex items-center gap-4 mb-8">
                <div className="bg-indigo-50 p-3 rounded-xl text-indigo-600">
                  <BookOpen className="h-8 w-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-800">How the Algorithm Works</h2>
                  <p className="text-slate-500 mt-1">Understanding the intelligence behind the schedule generation</p>
                </div>
             </div>
             
             <div className="prose prose-slate max-w-none">
                <p className="text-slate-600 mb-8 text-lg leading-relaxed">
                  Scheduling labs for hundreds of students across multiple years and hardware constraints is a complex mathematical challenge. To solve this, our engine translates your requirements into a <strong>Constraint Satisfaction Problem (CSP)</strong> and uses Google's powerful OR-Tools solver to explore thousands of combinations in milliseconds. Our system strictly acts as a <strong>Room Allocator</strong>—we respect the exact time slots provided in the timetable and find the most optimal physical room for each session.
                </p>

                <div className="space-y-12">
                  {/* Step 1: Data Preprocessing */}
                  <div className="relative pl-8 border-l-2 border-indigo-200">
                    <div className="absolute -left-3.5 top-0 bg-indigo-100 text-indigo-600 font-bold w-7 h-7 rounded-full flex items-center justify-center text-sm border-4 border-white">1</div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Data Preprocessing & Splitting</h3>
                    <p className="text-slate-600 mb-4 text-sm leading-relaxed">Before running the optimizer, the system prepares the data to handle large class strengths and long durations:</p>
                    <ul className="space-y-3 text-sm text-slate-700 bg-slate-50 p-5 rounded-xl border border-slate-100">
                      <li className="flex items-start gap-2">
                        <span className="text-indigo-500 mt-1">•</span>
                        <span><strong>Batch Splitting:</strong> If a course's strength (e.g., 120 students) exceeds the maximum available lab capacity (e.g., 80 seats), the system automatically divides the students into multiple batches (e.g., Batch 1 and Batch 2, 60 students each) and treats them as independent units that need concurrent rooms.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-indigo-500 mt-1">•</span>
                        <span><strong>Session Chunking:</strong> If a course has a total of 6 lab hours allocated in the timetable but conducts them in two 3-hour sessions, the system chunks the raw time periods into discrete, manageable sessions based on the course's specified lab duration.</span>
                      </li>
                    </ul>
                  </div>

                  {/* Step 2: Hard Constraints */}
                  <div className="relative pl-8 border-l-2 border-emerald-200">
                    <div className="absolute -left-3.5 top-0 bg-emerald-100 text-emerald-600 font-bold w-7 h-7 rounded-full flex items-center justify-center text-sm border-4 border-white">2</div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2">Hard Constraints</h3>
                    <p className="text-slate-600 mb-4 text-sm leading-relaxed">These are absolute rules. If a potential schedule violates even one of these, it is instantly rejected by the solver.</p>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                        <h4 className="font-bold text-emerald-800 text-sm mb-1">No Double-Booking</h4>
                        <p className="text-xs text-slate-600">A physical lab can only host one course/batch at a time during any given slot.</p>
                      </div>
                      <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                        <h4 className="font-bold text-emerald-800 text-sm mb-1">Strict Capacity</h4>
                        <p className="text-xs text-slate-600">Courses are only assigned to labs that have enough seats for every student in the batch.</p>
                      </div>
                      <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                        <h4 className="font-bold text-emerald-800 text-sm mb-1">Hardware Needs</h4>
                        <p className="text-xs text-slate-600">If a course strictly requires GPUs, it will only ever be assigned to a GPU-equipped lab.</p>
                      </div>
                      <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                        <h4 className="font-bold text-emerald-800 text-sm mb-1">Fixed Time Slots</h4>
                        <p className="text-xs text-slate-600">The algorithm only assigns rooms. It strictly respects the days and times provided by the Institute Timetable and does not move courses to different times.</p>
                      </div>
                    </div>
                  </div>

                  {/* Step 3: Soft Constraints */}
                  <div className="relative pl-8 border-l-2 border-amber-200">
                    <div className="absolute -left-3.5 top-0 bg-amber-100 text-amber-600 font-bold w-7 h-7 rounded-full flex items-center justify-center text-sm border-4 border-white">3</div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2">Smart Optimizations (Soft Constraints)</h3>
                    <p className="text-slate-600 mb-4 text-sm leading-relaxed">When multiple valid room assignments exist, the engine uses penalties to pick the <em>best</em> possible choice.</p>
                    <ul className="space-y-3 text-sm text-slate-700 bg-amber-50/50 p-5 rounded-xl border border-amber-100">
                      <li className="flex items-start gap-2">
                        <span className="text-amber-500 mt-1">★</span>
                        <div>
                          <strong>Conserving GPU Resources (High Priority):</strong> 
                          <p className="text-xs text-slate-500 mt-0.5">The engine applies a massive penalty if it tries to put a non-GPU course into a GPU-equipped lab. This ensures expensive GPU labs are always saved for courses that actually need them, unless absolutely no other regular labs are empty.</p>
                        </div>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-amber-500 mt-1">★</span>
                        <div>
                          <strong>Minimizing Wasted Seats (Low Priority):</strong> 
                          <p className="text-xs text-slate-500 mt-0.5">The engine favors "tighter fits". If a 60-student batch can fit in a 70-seat lab or a 300-seat lab, it will pick the 70-seat lab to leave the larger room available for bigger classes.</p>
                        </div>
                      </li>
                    </ul>
                  </div>
                </div>

             </div>
          </div>
        </div>
      )}


      {/* Add Course Modal */}
      {showAddCourse && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-bold text-slate-800">Add New Course</h2>
              <button onClick={() => setShowAddCourse(false)} className="text-slate-400 hover:text-slate-600"><X className="h-6 w-6" /></button>
            </div>
            <form onSubmit={handleAddCourse} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Course Code</label>
                  <input required type="text" value={newCourse.code} onChange={e => setNewCourse({...newCourse, code: e.target.value})} className="w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder="e.g. CS201" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Course Name</label>
                  <input type="text" value={newCourse.name} onChange={e => setNewCourse({...newCourse, name: e.target.value})} className="w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder="e.g. Data Structures" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Academic Year(s)</label>
                  <div className="flex flex-wrap gap-3">
                    {["1st Year", "2nd Year", "3rd Year", "4th Year", "MTech/PhD"].map(y => (
                      <label key={y} className="flex items-center gap-2 cursor-pointer bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
                        <input 
                          type="checkbox" 
                          checked={newCourse.academic_year ? newCourse.academic_year.split(',').includes(y) : false}
                          onChange={(e) => {
                            let current = newCourse.academic_year ? newCourse.academic_year.split(',') : [];
                            if (e.target.checked) current.push(y);
                            else current = current.filter(item => item !== y);
                            setNewCourse({...newCourse, academic_year: current.join(',')});
                          }}
                          className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500" 
                        />
                        <span className="text-sm font-semibold text-slate-700">{y}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Student Strength</label>
                  <input required type="number" value={newCourse.student_count} onChange={e => setNewCourse({...newCourse, student_count: e.target.value})} className="w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder="e.g. 50" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Instructor / Professor</label>
                  <input required type="text" value={newCourse.instructor} onChange={e => setNewCourse({...newCourse, instructor: e.target.value})} className="w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder="e.g. Dr. Smith" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Duration (Hours)</label>
                  <select value={newCourse.duration} onChange={e => setNewCourse({...newCourse, duration: e.target.value})} className="w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                    <option value="2">2 Hours</option>
                    <option value="3">3 Hours</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer p-2">
                    <input type="checkbox" checked={newCourse.gpu_required} onChange={e => setNewCourse({...newCourse, gpu_required: e.target.checked})} className="w-5 h-5 text-indigo-600 rounded" />
                    <span className="font-semibold text-slate-700">Requires GPU</span>
                  </label>
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setShowAddCourse(false)} className="px-5 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
                <button type="submit" className="px-5 py-2 font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors">Add Course</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Lab Modal */}
      {showAddLab && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-bold text-slate-800">Add New Lab</h2>
              <button onClick={() => setShowAddLab(false)} className="text-slate-400 hover:text-slate-600"><X className="h-6 w-6" /></button>
            </div>
            <form onSubmit={handleAddLab} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Lab Name</label>
                <input required type="text" value={newLab.name} onChange={e => setNewLab({...newLab, name: e.target.value})} className="w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder="e.g. Systems Lab" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Capacity (Seats)</label>
                <input required type="number" value={newLab.capacity} onChange={e => setNewLab({...newLab, capacity: e.target.value})} className="w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder="e.g. 60" />
              </div>
              <div>
                <label className="flex items-center gap-2 cursor-pointer mt-2 p-2">
                  <input type="checkbox" checked={newLab.has_gpu} onChange={e => setNewLab({...newLab, has_gpu: e.target.checked})} className="w-5 h-5 text-indigo-600 rounded" />
                  <span className="font-semibold text-slate-700">Equipped with GPUs</span>
                </label>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setShowAddLab(false)} className="px-5 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
                <button type="submit" className="px-5 py-2 font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors">Add Lab</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Extracted Courses Review Modal */}
      {showExtractedReview && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-indigo-500" />
                  Review Extracted Courses
                </h2>
                <p className="text-sm text-slate-500 mt-1">We parsed the PDF and found these CS/CSL lab courses. Please assign the missing metadata before importing.</p>
              </div>
              <button onClick={() => setShowExtractedReview(false)} className="text-slate-400 hover:text-slate-600"><X className="h-6 w-6" /></button>
            </div>
            
            <div className="overflow-y-auto p-6 bg-slate-50/50 flex-1">
              {extractedCourses.length === 0 ? (
                <div className="text-center py-10 text-slate-500">No lab courses found in the PDF.</div>
              ) : (
                <div className="space-y-4">
                  {extractedCourses.map((c, i) => (
                    <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col xl:flex-row gap-4 items-center">
                      {/* Extracted Data (Read-only) */}
                      <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                        <div>
                          <div className="text-xs font-bold text-slate-400 uppercase">Code</div>
                          <div className="font-black text-indigo-700">{c.code}</div>
                        </div>
                        <div className="col-span-2 md:col-span-1">
                          <div className="text-xs font-bold text-slate-400 uppercase">Course Name</div>
                          <div className="font-semibold text-slate-700 truncate" title={c.name}>{c.name}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-400 uppercase">Instructor</div>
                          <div className="font-medium text-slate-700 text-sm">{c.instructor || 'TBA'}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-400 uppercase">Lab Hours</div>
                          <div className="font-medium text-slate-700">{c.duration} Hrs</div>
                        </div>
                      </div>

                      {/* Manual Data Entry */}
                      <div className="w-full xl:w-[450px] flex items-center gap-3 bg-indigo-50/50 p-3 rounded-lg border border-indigo-100 shrink-0">
                        <div className="w-[40%]">
                          <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1.5">Academic Year(s) *</label>
                          <div className="flex flex-col gap-1.5">
                            {["1st Year", "2nd Year", "3rd Year", "4th Year"].map(y => (
                              <label key={y} className="flex items-center gap-1.5 cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  checked={c.academic_year ? c.academic_year.split(',').includes(y) : false}
                                  onChange={(e) => {
                                    let current = c.academic_year ? c.academic_year.split(',') : [];
                                    if (e.target.checked) current.push(y);
                                    else current = current.filter(item => item !== y);
                                    handleUpdateExtractedCourse(c.id, 'academic_year', current.join(','));
                                  }}
                                  className="w-3.5 h-3.5 text-indigo-600 rounded" 
                                />
                                <span className="text-xs font-semibold text-slate-700">{y}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="w-1/3">
                          <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Strength *</label>
                          <input 
                            type="number" 
                            required
                            placeholder="e.g. 60"
                            value={c.student_count} 
                            onChange={(e) => handleUpdateExtractedCourse(c.id, 'student_count', e.target.value)}
                            className="w-full text-sm border border-slate-200 rounded-md p-1.5 focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                        <div className="w-1/3 flex items-center justify-center pt-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={c.gpu_required} 
                              onChange={(e) => handleUpdateExtractedCourse(c.id, 'gpu_required', e.target.checked)}
                              className="w-4 h-4 text-emerald-600 rounded" 
                            />
                            <span className="text-xs font-bold text-slate-600">Need GPU</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-white">
              <button type="button" onClick={() => setShowExtractedReview(false)} className="px-6 py-2.5 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Discard</button>
              <button type="button" onClick={handleAddExtractedCourses} disabled={extractedCourses.length === 0} className="px-6 py-2.5 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-50">
                Import & Add to Requirements
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default LabAllocation;
