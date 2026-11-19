## Associate Comp Tool Data Diary


### To do:
- Update state dropdown list so it's pulling from a list of states, not the data's list of states
    - Remove PR from state dropdown list
    - Make sure states without data are in the list (AK & NM)

- Fix the "Update your info" button so it doesn't auto-populate data; it should just load an empty form

<hr>

### Map stuff
State-level data is not robust enough to support compare associates' pay within their state, so I'll stick to regions for comparison and display.

NO DATA available for Alaska or New Mexico – gray them out on map view?

STATES BY REGION:
=============================
Southeast
['Florida', 'Louisiana', 'Alabama', 'Kentucky', 'North Carolina', 'Delaware', 'Arkansas', 'Virginia', 'Georgia', 'Maryland', 'Mississippi', 'Tennessee', 'South Carolina', 'West Virginia', 'District of Columbia']
=============================
Northeast
['New York', 'Connecticut', 'Pennsylvania', 'Massachusetts', 'New Jersey', 'Maine', 'Rhode Island', 'New Hampshire', 'Vermont']
=============================
West
['California', 'Washington', 'Idaho', 'Oregon', 'Nevada', 'Utah', 'Colorado', 'Wyoming', 'Montana', 'Hawaii']
=============================
Midwest
['Missouri', 'Ohio', 'Wisconsin', 'Nebraska', 'Michigan', 'Indiana', 'South Dakota', 'North Dakota', 'Illinois', 'Iowa', 'Kansas', 'Minnesota']
=============================
Southwest
['Oklahoma', 'Texas', 'Arizona']
=============================
None
['Alaska', 'New Mexico']

<hr>

### Data wrangling notes
Not all regions have data that represents each firms size at each associate tier level, so I'm instead going to display firm-size data on a nationwide scale (also to avoid having to calculate each measure for each combo of region and firm size)