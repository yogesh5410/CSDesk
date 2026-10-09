const fs = require('fs');

let content = fs.readFileSync('/home/durgesh/Desktop/BTech-Project/CSDesk/client/src/pages/dashboard/LabAllocation.jsx', 'utf8');

// Replace standard SLOTS_MAP with timetableData state
content = content.replace(/const SLOTS_MAP = \{[\s\S]*?\};\n/, '');

// Add new states
content = content.replace(/const \[isUploading, setIsUploading\] = useState\(false\);/, `const [isUploading, setIsUploading] = useState(false);
  const [isUploadingTimetable, setIsUploadingTimetable] = useState(false);
  const [timetableData, setTimetableData] = useState(null);`);

content = content.replace(/const handleFileUpload = async \(e\) => \{[\s\S]*?finally \{\s*setIsUploading\(false\);\s*e.target.value = null;\s*\}\s*\};/, `const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch('/api/optimization/parse-pdf', { method: 'POST', body: formData });
      const result = await response.json();
      if (response.ok && result.courses) {
        const coursesWithEmptyFields = result.courses.map(c => ({
          ...c, student_count: '', academic_year: '1st Year', gpu_required: false, id: Math.random().toString(36).substr(2, 9)
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
      e.target.value = null;
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
  };`);

// Update mapping logic in handleAddExtractedCourses
content = content.replace(/const readyToAdd = extractedCourses\.map\(\(\{ id, \.\.\.rest \}\) => \(\{\s*\.\.\.rest,\s*student_count: parseInt\(rest\.student_count\),\s*duration: parseInt\(rest\.duration\)\s*\}\)\);/, `const readyToAdd = extractedCourses.map(({ id, ...rest }) => {
      let periods = [];
      if (timetableData && rest.lab_slot) {
        // e.g. "O23/DEPT" -> "O23"
        let slotStr = rest.lab_slot.split('/')[0].trim();
        let baseLetter = slotStr.charAt(0);
        let numbers = slotStr.substring(1);
        if (timetableData.slots[baseLetter]) {
           const day = timetableData.slots[baseLetter].day;
           const tPeriods = timetableData.slots[baseLetter].periods;
           if (!numbers) {
              periods = tPeriods.map(t => day + '_' + t);
           } else {
              for (let i = 0; i < numbers.length; i++) {
                 let idx = parseInt(numbers[i]) - 1;
                 if (idx >= 0 && idx < tPeriods.length) {
                    periods.push(day + '_' + tPeriods[idx]);
                 }
              }
           }
        }
      }
      return {
        ...rest,
        student_count: parseInt(rest.student_count),
        duration: parseInt(rest.duration) || periods.length,
        periods: periods
      };
    });`);

fs.writeFileSync('/home/durgesh/Desktop/BTech-Project/CSDesk/client/src/pages/dashboard/LabAllocation.jsx', content);
