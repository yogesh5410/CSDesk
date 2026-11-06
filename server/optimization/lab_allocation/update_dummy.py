import json

with open('dummy_data.json', 'r') as f:
    data = json.load(f)

new_slots = []
id_counter = 1
for day in ['MON', 'TUE', 'WED', 'THU', 'FRI']:
    for sub in ['M1', 'M2', 'A1', 'A2']:
        new_slots.append({
            "id": id_counter,
            "code": f"{day}_{sub}"
        })
        id_counter += 1

data['slots'] = new_slots

with open('dummy_data.json', 'w') as f:
    json.dump(data, f, indent=2)

