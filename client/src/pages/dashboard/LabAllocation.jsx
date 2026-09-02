import { useState, useEffect } from "react";
import { 
  FlaskConical, Cpu, Users, Clock, Calendar, CheckCircle2, 
  AlertCircle, RefreshCw, LayoutGrid, Database, Play, TableProperties,
  Plus, Save, GraduationCap, X, User
} from "lucide-react";

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const SLOTS_MAP = {
  'Monday': { morning: 'N', afternoon: 'O' },
  'Tuesday': { morning: 'V', afternoon: 'W' },
  'Wednesday': { morning: 'P', afternoon: 'Q' },
  'Thursday': { morning: 'R', afternoon: 'S' },
  'Friday': { morning: 'T', afternoon: 'U' }
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
  
  const [newCourse, setNewCourse] = useState({ code: '', student_count: '', gpu_required: false, academic_year: '', instructor: '', duration: 3 });
  const [newLab, setNewLab] = useState({ name: '', capacity: '', has_gpu: false });

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
    setNewCourse({ code: '', student_count: '', gpu_required: false, academic_year: '', instructor: '', duration: 3 });
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

  const getSlotAllocations = (slotCode) => {
    return allocations.filter(a => a.slot === slotCode);
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
          <div className="flex justify-end gap-3">
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
                      <th className="p-4">Course Code</th>
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
                        <td className="p-4 font-bold text-indigo-600">{course.code}</td>
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
                      <th className="p-6 border-r border-[#2a4b7c] w-40 font-black text-xl">Day</th>
                      <th className="p-6 border-r border-[#2a4b7c] w-[40%]">
                        <div className="font-bold text-xl">Morning Slot</div>
                        <div className="text-blue-200 font-medium mt-1">09:30 AM - 12:25 PM</div>
                      </th>
                      <th className="p-6 w-[40%]">
                        <div className="font-bold text-xl">Afternoon Slot</div>
                        <div className="text-blue-200 font-medium mt-1">02:30 PM - 05:25 PM</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS.map(day => (
                      <tr key={day} className="border-b border-slate-200 hover:bg-slate-50 transition-colors group">
                        <td className="p-6 border-r border-slate-200 font-black text-slate-700 bg-slate-50 group-hover:bg-slate-100 text-lg">
                          {day}
                        </td>
                        
                        {/* Morning */}
                        <td className="p-4 border-r border-slate-200 align-top">
                          <div className="font-black text-slate-400 mb-4 border-b pb-2 text-sm tracking-widest uppercase">SLOT {SLOTS_MAP[day].morning}</div>
                          <div className="flex flex-wrap gap-4 justify-center">
                            {getSlotAllocations(SLOTS_MAP[day].morning).map((alloc, idx) => (
                              <div key={idx} className="bg-white border-2 border-indigo-100 rounded-xl p-4 text-left shadow-sm min-w-[220px] hover:border-indigo-300 transition-colors group/card">
                                <div className="flex justify-between items-start mb-2">
                                  <div className="font-black text-indigo-700 text-lg">{alloc.course}</div>
                                </div>
                                {alloc.year && <div className="text-xs font-bold text-slate-500 mb-2 uppercase">{alloc.year}</div>}
                                {alloc.instructor && <div className="text-sm text-slate-700 font-medium flex items-center gap-1.5 mb-2"><User className="h-4 w-4 text-slate-400" /> {alloc.instructor}</div>}
                                <div className="text-sm text-slate-600 mt-3 pt-3 border-t flex items-center gap-2"><LayoutGrid className="h-4 w-4 text-slate-400" />{alloc.lab}</div>
                              </div>
                            ))}
                            {getSlotAllocations(SLOTS_MAP[day].morning).length === 0 && <span className="text-slate-300 font-medium italic py-8 block w-full">No allocations</span>}
                          </div>
                        </td>

                        {/* Afternoon */}
                        <td className="p-4 align-top bg-blue-50/20">
                          <div className="font-black text-slate-400 mb-4 border-b pb-2 text-sm tracking-widest uppercase">SLOT {SLOTS_MAP[day].afternoon}</div>
                          <div className="flex flex-wrap gap-4 justify-center">
                            {getSlotAllocations(SLOTS_MAP[day].afternoon).map((alloc, idx) => (
                              <div key={idx} className="bg-white border-2 border-blue-100 rounded-xl p-4 text-left shadow-sm min-w-[220px] hover:border-blue-300 transition-colors">
                                <div className="flex justify-between items-start mb-2">
                                  <div className="font-black text-blue-700 text-lg">{alloc.course}</div>
                                </div>
                                {alloc.year && <div className="text-xs font-bold text-slate-500 mb-2 uppercase">{alloc.year}</div>}
                                {alloc.instructor && <div className="text-sm text-slate-700 font-medium flex items-center gap-1.5 mb-2"><User className="h-4 w-4 text-slate-400" /> {alloc.instructor}</div>}
                                <div className="text-sm text-slate-600 mt-3 pt-3 border-t flex items-center gap-2"><LayoutGrid className="h-4 w-4 text-slate-400" />{alloc.lab}</div>
                              </div>
                            ))}
                            {getSlotAllocations(SLOTS_MAP[day].afternoon).length === 0 && <span className="text-slate-300 font-medium italic py-8 block w-full">No allocations</span>}
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
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Academic Year</label>
                  <input required type="text" value={newCourse.academic_year} onChange={e => setNewCourse({...newCourse, academic_year: e.target.value})} className="w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder="e.g. 2nd Year" />
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

    </div>
  );
};

export default LabAllocation;
