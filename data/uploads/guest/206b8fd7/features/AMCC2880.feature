Feature: Homepage Widgets - Validation and Data Consistency

  Background:
    Given User logs in to the Americold Compass application with valid credentials
    Then Home page should be displayed '<homepageTitle>' 
    Examples:
      | homepageTitle          |
      | generic |

  # @homepage-widgets @regression @amcc-tc-8418
  # Scenario Outline: AMCC-TC-8418 Validation of total Orders count by creating an order
  #   When Verify Order status summary is displayed and set Facility  and Customer and Date Range Today
  #   And Note down Total orders and Pending orders counts
  #   When Navigate to Reports -> Outbound -> Orders and create an order for Facility '<inputdata>'
  #   Then Verify the noted Total orders and Pending orders counts have increased by 1
  # Examples:
  #   | inputdata  |
  #   | AMCC-TC-8418 | Moved to r3

  @homepage-widgets @regression @amcc-tc-8417
  Scenario Outline: AMCC-TC-8417 Validation of total Cancelled count
  #   When Verify Order status summary is displayed and set Facility  and Customer , Date Range Last 7 Days '<inputData>'
  #   And Note down Total Cancelled count
  #   When Navigate to Reports -> Outbound -> Orders and apply Facility '<inputdata>', Date Range Last 7 days and Status Cancelled and Click Search
  #   Then Verify total cancelled count matches the widget count noted earlier
  # Examples:
  #   | inputdata  | 
  #   | AMCC-TC-8417 | 

  @homepage-widgets @regression @amcc-tc-8416
  Scenario Outline: AMCC-TC-8416 Validation of total delayed not shipped count
  #   When Verify Order status summary is displayed and set Facility  and Customer and Date Range Today '<inputdata>'
  #   And Note down Total delayed not shipped count
  #   When Navigate to Reports -> Outbound -> Orders and set filters Status = Open or Allocated, Expected Ship Date '<inputdata>' and Appt ID not null and Click Search
  #   Then Verify total matches the widget count
  # Examples:
  #   | inputdata   | 
  #   | AMCC-TC-8416 | 

  @homepage-widgets @regression @amcc-tc-8415
  Scenario Outline: AMCC-TC-8415 Validation of total pending orders count
    # When Verify Order status summary is displayed and set Facility  and Customer , Date Range Last 7 Days '<inputData>'
    # And Note down Total pending orders count
    # When Navigate to Reports -> Outbound -> Orders and set Status Open&Allocated and Date Range Last 7 days and Click Search
    # Then Verify total matches the widget count
    
  @homepage-widgets @regression @amcc-tc-8414
  Scenario Outline: AMCC-TC-8414 Validation of total shipped count
    # When Verify Order status summary is displayed and set Facility  and Customer and Date Range Today '<inputdata>'
    # And Note down Total Shipped count
    # When Navigate to Reports -> Outbound -> Orders and set Status Dispatched and Date Range Today and Click Search
    # Then Verify total matches the widget count


  @homepage-widgets @regression @amcc-tc-8413
  Scenario Outline: AMCC-TC-8413 Validation of total orders count
    # When Verify Order status summary is displayed and set Facility  and Customer , Date Range Last 7 Days '<inputData>'
    # And Note down Total Orders count
    # When Navigate to Reports -> Outbound -> Orders and set Date Range Last 7 days and Click Search
    # Then Verify total orders count matches the widget count

  # @homepage-widgets @regression @amcc-tc-6798
  # Scenario Outline: AMCC-TC-6798 Verification of widget refresh after updating the orders
  #   When Verify Order status summary is displayed for '<inputdata>'
  #   Then Order widget should refresh dynamically as order data updates
  # Examples:
  #   | inputdata  |
  #   | AMCC-TC-6798 |

  # @homepage-widgets @regression @amcc-tc-6796
  # Scenario Outline: AMCC-TC-6796 Verification of Categorized orders are hyperlink
  #   When Verify Order status summary is displayed and category counts are visible for '<inputdata>'
  #   And Click on each category count 
  #   Then User should be redirected to respective Orders page filtered for that category 'receiptdata'
  # Examples:
  #   |inputdata   | receiptdata                       |
  #   | AMCC-TC-6796 | Shipped, Pending, Cancelled, Delayed Not Shipped |

  # @homepage-widgets @regression @amcc-tc-6793
  # Scenario Outline: AMCC-TC-6793 Validation of order categories
  #   When Verify Order status summary is displayed for '<inputdata>'
  #   Then Orders should be grouped by Shipped, Pending Orders, Delayed Not Shipped, Cancelled
  # Examples:
  #   | inputdata  |
  #   | AMCC-TC-6793 |

  # @homepage-widgets @regression @amcc-tc-6788
  # Scenario Outline: AMCC-TC-6788 Verifying the sorting order of Facility and Customer Dropdown
  #   When Verify 'Order status' summary is displayed and open Facilities and Customers dropdown for '<inputdata>'
  #   Then Verify that all facilities and customers linked to the user are displayed in ascending order
  # Examples:
  #   | inputdata  |
  #   | AMCC-TC-6788 |
