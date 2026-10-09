import { useState, useEffect } from "react";
import { 
  FlaskConical, Cpu, Users, Clock, Calendar, CheckCircle2, 
  AlertCircle, RefreshCw, LayoutGrid, Database, Play, TableProperties,
  Plus, Save, GraduationCap, X, User, Upload, FileText
} from "lucide-react";

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const SLOTS_MAP = {
  'Monday': { m1: 'MON_M1', m2: 'MON_M2', a1: 'MON_A1', a2: 'MON_A2' },
  'Tuesday': { m1: 'TUE_M1', m2: 'TUE_M2', a1: 'TUE_A1', a2: 'TUE_A2' },
  'Wednesday': { m1: 'WED_M1', m2: 'WED_M2', a1: 'WED_A1', a2: 'WED_A2' },
  'Thursday': { m1: 'THU_M1', m2: 'THU_M2', a1: 'THU_A1', a2: 'THU_A2' },
  'Friday': { m1: 'FRI_M1', m2: 'FRI_M2', a1: 'FRI_A1', a2: 'FRI_A2' }
};

const LabAllocation = () => {
  const [activeTab, setActiveTab] = useState('data');
  const [data, setData] = useState({ labs: [], courses: [], slots: [] });
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Modals for adding data
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [showAddLab, setShowAddLab] = useState(false);
  
  const [newCourse, setNewCourse] = useState({ code: '', name: '', student_count: '', gpu_required: false, academic_year: '', instructor: '', duration: 3 });
  const [newLab, setNewLab] = useState({ name: '', capacity: '', has_gpu: false });

  // PDF Upload states
  const [isUploading, setIsUploading] = useState(false);
  const [extractedCourses, setExtractedCourses] = useState([]);
  const [showExtractedReview, setShowExtractedReview] = useState(false);

  // Fetch initial data
  useEffect(() => {
    fetch('/api/optimization/data')
      .then(res => res.json())
      .then(d => setData(d))
      .catch(e => console.error(e));
  }, []);

  const handleRunOptimization = async () => {
    setLoading(true);
    setError(null);
    setActiveTab('timetable');
    try {
      const response = await fetch('/api/optimization/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
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
      courses: [...data.courses, { ...newCourse, student_count: parseInt(newCourse.student_count), duration: parseInt(newCourse.duration) }]
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
    const id = Math.max(...data.labs.map(l => l.id), 0) + 1;
    setData({
      ...data,
      labs: [...data.labs, { ...newLab, id, capacity: parseInt(newLab.capacity) }]
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
    
    
    // Extracting all valid courses from PDF and dropping the temp 'id'
    const readyToAdd = extractedCourses.map(({ id, ...rest }) => ({
      ...rest,
      student_count: parseInt(rest.student_count),
      duration: parseInt(rest.duration)
    }));
    
    // OVERWRITE existing courses as requested by user
    setData({
      ...data,
      courses: readyToAdd
    });
    
    setShowExtractedReview(false);
    setExtractedCourses([]);
  };

  const getSlotAllocations = (slotCode) => {
    return allocations.filter(a => a.slot === slotCode);
  };

  const getProcessedBlock = (slot1, slot2) => {
    const a1 = [...allocations.filter(a => a.slot === slot1)];
    const a2 = [...allocations.filter(a => a.slot === slot2)];
    
    const spanned = [];
    const only1 = [];
    const only2 = [];
    
    a1.forEach(alloc1 => {
      const matchIdx = a2.findIndex(alloc2 => alloc2.course === alloc1.course && alloc2.lab === alloc1.lab);
      if (matchIdx !== -1) {
        spanned.push({ ...alloc1, span: 2 });
        a2.splice(matchIdx, 1);
      } else {
        only1.push({ ...alloc1, span: 1, col: 1 });
      }
    });
    
    a2.forEach(alloc2 => {
      only2.push({ ...alloc2, span: 1, col: 2 });
    });
    
    return [...spanned, ...only1, ...only2];
  };

  const getTimeString = (slotCode, span) => {
    if (slotCode.includes('_M1')) return span === 2 ? '08:30 AM - 12:30 PM' : '08:30 AM - 10:30 AM';
    if (slotCode.includes('_M2')) return '10:30 AM - 12:30 PM';
    if (slotCode.includes('_A1')) return span === 2 ? '01:30 PM - 05:30 PM' : '01:30 PM - 03:30 PM';
    if (slotCode.includes('_A2')) return '03:30 PM - 05:30 PM';
    return '';
  };

  return (
    <div className="flex flex-col h-full space-y-6 w-full mx-auto p-4 md:p-6 lg:p-8">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3 tracking-tight">
            <FlaskConical className="h-8 w-8 text-indigo-600" />
            Autonomous Lab Scheduler
          </h1>
          <p className="text-slate-500 mt-2 text-lg">Configure parameters and generate conflict-free institute timetables.</p>
        </div>
        
        <div className="flex bg-slate-100 p-1.5 rounded-xl">
          <button onClick={() => setActiveTab('data')} className={`px-6 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 ${activeTab === 'data' ? 'bg-white shadow text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}>
            <Database className="h-5 w-5" /> Data Source
          </button>
          <button onClick={() => setActiveTab('timetable')} className={`px-6 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 ${activeTab === 'timetable' ? 'bg-white shadow text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}>
            <TableProperties className="h-5 w-5" /> Timetable Output
          </button>
        </div>
      </div>

      {/* Tab: Data Source */}
      {activeTab === 'data' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="flex justify-end gap-3 flex-wrap">
              <label className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 px-5 py-2.5 rounded-xl font-medium transition-all shadow-sm cursor-pointer">
                {isUploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {isUploading ? "Parsing PDF..." : "Upload Timetable PDF"}
                <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
              </label>
             <button onClick={() => setShowAddLab(true)} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-5 py-2.5 rounded-xl font-medium transition-all shadow-sm">
                <Plus className="h-4 w-4" /> Add Lab
              </button>
             <button onClick={() => setShowAddCourse(true)} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-5 py-2.5 rounded-xl font-medium transition-all shadow-sm">
                <Plus className="h-4 w-4" /> Add Course
              </button>
             <button onClick={handleRunOptimization} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-2.5 rounded-xl font-bold transition-all shadow-sm shadow-indigo-200">
                <Play className="h-5 w-5 fill-current" /> Run Algorithm
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
                    {data.courses.map(course => (
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
                    {data.labs.map(lab => (
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

      {/* Tab: Timetable Output */}
      {activeTab === 'timetable' && (
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
                <table className="w-full text-center border-collapse">
                  <thead>
                    <tr className="bg-[#1e3a5f] text-white">
                      <th className="p-4 border-r border-[#2a4b7c] w-24 font-black text-xl">Day</th>
                      <th className="p-4 border-r border-[#2a4b7c] w-[40%]">
                        <div className="font-bold text-lg">Morning Block (4 Hours)</div>
                        <div className="text-blue-200 font-medium mt-1">08:30 AM - 12:30 PM</div>
                      </th>
                      <th className="p-4 w-[40%]">
                        <div className="font-bold text-lg">Afternoon Block (4 Hours)</div>
                        <div className="text-blue-200 font-medium mt-1">01:30 PM - 05:30 PM</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS.map(day => (
                      <tr key={day} className="border-b border-slate-200 hover:bg-slate-50 transition-colors group">
                        <td className="p-4 border-r border-slate-200 font-black text-slate-700 bg-slate-50 group-hover:bg-slate-100 text-lg">
                          {day}
                        </td>
                        
                        {/* Morning Block */}
                        <td className="p-3 border-r border-slate-200 align-top">
                          <div className="grid grid-cols-2 gap-3 grid-flow-row-dense">
                            <div className="font-black text-slate-400 border-b pb-2 text-xs tracking-widest uppercase text-center col-start-1">SLOT {SLOTS_MAP[day].m1}</div>
                            <div className="font-black text-slate-400 border-b pb-2 text-xs tracking-widest uppercase text-center col-start-2">SLOT {SLOTS_MAP[day].m2}</div>
                            
                            {getProcessedBlock(SLOTS_MAP[day].m1, SLOTS_MAP[day].m2).map((alloc, idx) => (
                              <div key={idx} className={`bg-white border-2 border-indigo-100 rounded-xl p-3 text-left shadow-sm hover:border-indigo-300 transition-colors ${alloc.span === 2 ? 'col-span-2 shadow-md bg-indigo-50/40' : (alloc.col === 1 ? 'col-start-1' : 'col-start-2')}`}>
                                <div className="flex justify-between items-center mb-1">
                                  <div className="font-black text-indigo-700 text-base">{alloc.course}</div>
                                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${alloc.span === 2 ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                      {alloc.duration || (alloc.span === 2 ? 4 : 2)} HOUR LAB
                                  </span>
                                </div>
                                <div className="text-xs text-slate-500 font-bold flex items-center gap-1.5 mb-2 mt-1 bg-slate-50/80 w-max px-2 py-1 rounded-md border border-slate-100">
                                   <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                                   {getTimeString(alloc.slot, alloc.span)}
                                </div>
                                {alloc.name && <div className="text-xs font-semibold text-indigo-500 mb-1 truncate" title={alloc.name}>{alloc.name}</div>}
                                {alloc.year && <div className="text-[10px] font-bold text-slate-500 mb-1 uppercase">{alloc.year}</div>}
                                {alloc.instructor && <div className="text-xs text-slate-700 font-medium flex items-center gap-1 mb-1 truncate"><User className="h-3 w-3 text-slate-400 shrink-0" /> {alloc.instructor}</div>}
                                <div className="text-xs text-slate-600 mt-2 pt-2 border-t flex items-center gap-1.5"><LayoutGrid className="h-3 w-3 text-slate-400 shrink-0" />{alloc.lab}</div>
                              </div>
                            ))}
                            {getProcessedBlock(SLOTS_MAP[day].m1, SLOTS_MAP[day].m2).length === 0 && <div className="col-span-2 text-slate-300 font-medium italic py-4 text-center text-sm">Empty</div>}
                          </div>
                        </td>

                        {/* Afternoon Block */}
                        <td className="p-3 align-top bg-blue-50/10">
                          <div className="grid grid-cols-2 gap-3 grid-flow-row-dense">
                            <div className="font-black text-slate-400 border-b pb-2 text-xs tracking-widest uppercase text-center col-start-1">SLOT {SLOTS_MAP[day].a1}</div>
                            <div className="font-black text-slate-400 border-b pb-2 text-xs tracking-widest uppercase text-center col-start-2">SLOT {SLOTS_MAP[day].a2}</div>
                            
                            {getProcessedBlock(SLOTS_MAP[day].a1, SLOTS_MAP[day].a2).map((alloc, idx) => (
                              <div key={idx} className={`bg-white border-2 border-blue-100 rounded-xl p-3 text-left shadow-sm hover:border-blue-300 transition-colors ${alloc.span === 2 ? 'col-span-2 shadow-md bg-blue-50/40' : (alloc.col === 1 ? 'col-start-1' : 'col-start-2')}`}>
                                <div className="flex justify-between items-center mb-1">
                                  <div className="font-black text-blue-700 text-base">{alloc.course}</div>
                                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${alloc.span === 2 ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                      {alloc.duration || (alloc.span === 2 ? 4 : 2)} HOUR LAB
                                  </span>
                                </div>
                                <div className="text-xs text-slate-500 font-bold flex items-center gap-1.5 mb-2 mt-1 bg-slate-50/80 w-max px-2 py-1 rounded-md border border-slate-100">
                                   <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                                   {getTimeString(alloc.slot, alloc.span)}
                                </div>
                                {alloc.name && <div className="text-xs font-semibold text-blue-500 mb-1 truncate" title={alloc.name}>{alloc.name}</div>}
                                {alloc.year && <div className="text-[10px] font-bold text-slate-500 mb-1 uppercase">{alloc.year}</div>}
                                {alloc.instructor && <div className="text-xs text-slate-700 font-medium flex items-center gap-1 mb-1 truncate"><User className="h-3 w-3 text-slate-400 shrink-0" /> {alloc.instructor}</div>}
                                <div className="text-xs text-slate-600 mt-2 pt-2 border-t flex items-center gap-1.5"><LayoutGrid className="h-3 w-3 text-slate-400 shrink-0" />{alloc.lab}</div>
                              </div>
                            ))}
                            {getProcessedBlock(SLOTS_MAP[day].a1, SLOTS_MAP[day].a2).length === 0 && <div className="col-span-2 text-slate-300 font-medium italic py-4 text-center text-sm">Empty</div>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && !error && allocations.length === 0 && (
             <div className="flex flex-col items-center justify-center h-96 bg-white rounded-3xl border border-slate-100 shadow-sm border-dashed">
             <Calendar className="h-20 w-20 text-slate-200 mb-6" />
             <p className="text-slate-500 text-xl font-bold">No schedule generated yet.</p>
             <button onClick={handleRunOptimization} className="mt-6 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold text-lg transition-all shadow-sm">
                <Play className="h-5 w-5 fill-current" /> Run Algorithm Now
              </button>
           </div>
          )}
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
